const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const { MongoClient } = require('mongodb');
const { GridFSBucket } = require('mongodb');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const Product = require('./models/product');
const User = require('./models/user');
const Order = require('./models/Order');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection - ใช้การเชื่อมต่อแบบที่ทำงานได้
mongoose
  .connect('mongodb+srv://poopoqr2:Wowo303030@cluster0.dzux1.mongodb.net/SmartCash?retryWrites=true&w=majority', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch((err) => console.error('Error connecting to MongoDB:', err));

// GridFS setup
let gfs;
const initializeGridFS = async () => {
  try {
    const client = await MongoClient.connect('mongodb+srv://poopoqr2:Wowo303030@cluster0.dzux1.mongodb.net/SmartCash?retryWrites=true&w=majority');
    const db = client.db();
    gfs = new GridFSBucket(db, {
      bucketName: 'uploads'
    });
    console.log('GridFS initialized');
  } catch (err) {
    console.error('Error initializing GridFS:', err);
  }
};

// Initialize GridFS after MongoDB connection
initializeGridFS();

// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

// API endpoint สำหรับอัพโหลดรูปภาพ
app.post('/upload', upload.single('image'), (req, res) => {
  if (req.file) {
    res.json({ fileId: req.file.id });
  } else {
    res.status(400).json({ message: 'No file uploaded' });
  }
});

// Get image endpoint
app.get('/images/:id', async (req, res) => {
  try {
    const _id = new mongoose.Types.ObjectId(req.params.id);
    const files = await gfs.find({ _id }).toArray();
    if (!files || files.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบรูปภาพ'
      });
    }
    res.set('Content-Type', files[0].contentType);
    const downloadStream = gfs.openDownloadStream(_id);
    downloadStream.pipe(res);
  } catch (error) {
    console.error('Error getting image:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงรูปภาพ'
    });
  }
});

//เพิ่มข้อมูลตะกร้าสินค้า
app.post('/orders', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log('Received order data:', req.body);
    const { items, totalAmount } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('ข้อมูลรายการสินค้าไม่ถูกต้อง');
    }

    // ตรวจสอบและอัพเดทจำนวนสินค้าทั้งหมดก่อน
    for (const item of items) {
      const product = await Product.findOne({
        "listProduct._id": item.barcode
      }).session(session);

      if (!product) {
        throw new Error(`ไม่พบสินค้า: ${item.name}`);
      }

      const productItem = product.listProduct.find(
        p => p._id.toString() === item.barcode
      );

      if (!productItem) {
        throw new Error(`ไม่พบข้อมูลสินค้า: ${item.name}`);
      }

      if (productItem.quantity < item.quantity) {
        throw new Error(
          `สินค้า ${item.name} มีไม่เพียงพอ (เหลือ ${productItem.quantity}, ต้องการ ${item.quantity})`
        );
      }

      // อัพเดทจำนวนสินค้า
      productItem.quantity -= item.quantity;
      await product.save({ session });
    }

    // สร้าง order
    const order = new Order({
      items: items.map(item => ({
        productName: item.name,
        quantity: item.quantity,
        price: item.price,
        category: item.category,
        barcode: item.barcode,
        image: item.image
      })),
      totalAmount,
      orderDate: new Date()
    });

    await order.save({ session });
    await session.commitTransaction();

    console.log('Order saved successfully:', order._id);

    res.status(201).json({
      success: true,
      data: order
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Error creating order:', error);

    let statusCode = 500;
    let errorMessage = error.message;

    if (error.message.includes('ไม่พบสินค้า') || 
        error.message.includes('มีไม่เพียงพอ') ||
        error.message.includes('ข้อมูลรายการสินค้าไม่ถูกต้อง')) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  } finally {
    session.endSession();
  }
});

// Login endpoint (your working version)
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log('Received email:', email);

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'ไม่พบผู้ใช้งาน' });
    }

    console.log('User found:', user);

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'รหัสผ่านไม่ถูกต้อง' });
    }

    res.status(200).json({
      message: 'เข้าสู่ระบบสำเร็จ',
      userId: user._id,
      email: user.email,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
  }
});


// Product Routes
app.post('/products', async (req, res) => {
  console.log('Request body:', req.body);
  try {
    const { lotDate, cost } = req.body;
    const product = new Product({
      lotDate,
      cost: Number(cost),
      listProduct: []
    });
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: error.message });
  }
});

app.patch('/products/updatebarcode/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { productItemId } = req.body;

    const product = await Product.findOneAndUpdate(
      { 
        _id: productId,
        'listProduct._id': productItemId 
      },
      {
        $set: {
          'listProduct.$.barcode': productItemId // ใช้ _id ของ listProduct เป็น barcode
        }
      },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบสินค้าที่ต้องการอัพเดต'
      });
    }

    res.json({
      success: true,
      message: 'อัพเดตบาร์โค้ดเรียบร้อยแล้ว',
      data: product
    });

  } catch (error) {
    console.error('Error updating barcode:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการอัพเดตบาร์โค้ด'
    });
  }
});

app.get('/dashboard/:monthYear', async (req, res) => {
  try {
    const { monthYear } = req.params;
    const [month, year] = monthYear.split('-').map(Number);
    
    // Create date range for the selected month
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);

    // Fetch orders for the selected month
    const orders = await Order.find({
      orderDate: {
        $gte: startDate,
        $lte: endDate
      }
    });

    // Fetch all products to get costs
    const products = await Product.find();

    // Calculate total sales and gather product statistics
    let totalSales = 0;
    let totalCost = 0;
    const productStats = {};
    
    // เพิ่มการคำนวณรายวัน
    const dailySales = {};

    // Process orders
    orders.forEach(order => {
      totalSales += order.totalAmount;
      
      // คำนวณยอดขายรายวัน
      const orderDate = new Date(order.orderDate);
      const dayKey = orderDate.getDate();
      dailySales[dayKey] = (dailySales[dayKey] || 0) + order.totalAmount;
      
      // Process each item in the order
      order.items.forEach(item => {
        if (!productStats[item.productName]) {
          productStats[item.productName] = {
            name: item.productName,
            category: item.category,
            totalSales: 0,
            quantitySold: 0,
            revenue: 0
          };
        }
        
        productStats[item.productName].quantitySold += item.quantity;
        productStats[item.productName].revenue += item.price * item.quantity;
        productStats[item.productName].totalSales += 1;
      });
    });

    // Calculate total cost from products
    products.forEach(product => {
      totalCost += product.cost || 0;
    });

    // Convert productStats object to array and sort by revenue
    const topProducts = Object.values(productStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5); // Get top 5 products

    // Calculate total profit
    const totalProfit = totalSales - totalCost;

    res.json({
      success: true,
      data: {
        totalSales,
        totalCost,
        totalProfit,
        dailySales, // เพิ่ม dailySales เป็นออบเจ็กต์
        topProducts,
        orderCount: orders.length,
        monthlyStats: {
          month,
          year,
          totalSales,
          totalProfit
        }
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูล Dashboard'
    });
  }
});

app.get('/orders', async (req, res) => {
  // เพิ่ม console.log เพื่อตรวจสอบการเรียก route
  console.log('Request received at /orders');
  console.log('Query parameters:', req.query);

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    console.log('Page:', page, 'Limit:', limit, 'Skip:', skip);

    const orders = await Order.find()
      .sort({ orderDate: -1 }) 
      .skip(skip)
      .limit(limit);

    console.log('Found orders:', orders.length);

    res.json({
      success: true,
      data: orders,
      page,
      totalOrders: await Order.countDocuments()
    });
  } catch (error) {
    console.error('Error in /orders route:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลออเดอร์'
    });
  }
});

app.get('/products', async (req, res) => {
  try {
    const products = await Product.find().sort({ lotDate: -1 });
    res.status(200).json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: error.message });
  }
});

// เพิ่มรายการสินค้า
app.post('/addproducts/:productId', upload.single('image'), async (req, res) => {
  let uploadStream;
  try {
    const { productId } = req.params;
    const { productName, category, price, quantity } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบล็อตสินค้า'
      });
    }

    let imageId = null;

    if (req.file) {
      const filename = `${Date.now()}-${req.file.originalname}`;
      uploadStream = gfs.openUploadStream(filename, {
        contentType: req.file.mimetype
      });
      imageId = uploadStream.id;

      await new Promise((resolve, reject) => {
        uploadStream.on('finish', resolve);
        uploadStream.on('error', reject);
        uploadStream.end(req.file.buffer);
      });
    }

    const listProduct = {
      name: productName,
      category,
      price: Number(price),
      image: imageId,
      quantity: Number(quantity),
    };

    product.listProduct.push(listProduct);
    await product.save();

    res.status(201).json({
      success: true,
      message: 'เพิ่มสินค้าสำเร็จ',
      data: product
    });

  } catch (error) {
    if (uploadStream && uploadStream.id) {
      try {
        await gfs.delete(uploadStream.id);
      } catch (deleteError) {
        console.error('Error deleting failed upload:', deleteError);
      }
    }
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'เกิดข้อผิดพลาดในการอัพโหลด'
    });
  }
});

// เพิ่ม endpoint สำหรับดึงข้อมูลสินค้าในล็อตที่ระบุ
app.get('/products/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    
    // ค้นหาล็อตสินค้าตาม ID
    const product = await Product.findById(productId);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบล็อตสินค้า'
      });
    }

    // ส่งข้อมูลล็อตและรายการสินค้ากลับไป
    res.status(200).json({
      success: true,
      data: {
        lotDate: product.lotDate,
        cost: product.cost,
        listProduct: product.listProduct
      }
    });

  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูล'
    });
  }
});

app.get('/products/barcode/:barcode', async (req, res) => {
  try {
    const { barcode } = req.params;
    
    // ค้นหาสินค้าใน listProduct ของทุกล็อต
    const products = await Product.find({
      "listProduct._id": barcode
    });
    
    if (!products || products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบสินค้า'
      });
    }

    // หาสินค้าที่ตรงกับ barcode
    const product = products[0];
    const item = product.listProduct.find(item => item._id.toString() === barcode);

    res.status(200).json({
      success: true,
      data: {
        name: item.name,
        category: item.category,
        price: item.price,
        image: item.image,
        barcode: item._id
      }
    });

  } catch (error) {
    console.error('Error finding product:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการค้นหาสินค้า'
    });
  }
});

// Root route
app.get('/', (req, res) => {
  res.send('Hello, World!');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err);
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'ไฟล์มีขนาดใหญ่เกินไป (จำกัด 5MB)'
      });
    }
    return res.status(400).json({
      success: false,
      message: `เกิดข้อผิดพลาดในการอัพโหลด: ${err.message}`
    });
  }
  res.status(500).json({
    success: false,
    message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์'
  });
});

// ดึงข้อมูล user profile
app.get('/users/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'ไม่พบผู้ใช้งาน' 
      });
    }

    res.json({
      success: true,
      data: {
        email: user.email,
        ShopName: user.ShopName,
        ShopCode: user.ShopCode,
        employees: user.employees
      }
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้' 
    });
  }
});

// อัพเดตข้อมูล user profile
app.put('/users/:userId', async (req, res) => {
  try {
    const { ShopName, ShopCode, employees, currentPassword, newPassword } = req.body;
    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'ไม่พบผู้ใช้งาน' 
      });
    }

    // ถ้ามีการส่งรหัสผ่านมาเปลี่ยน
    if (currentPassword && newPassword) {
      // ตรวจสอบรหัสผ่านปัจจุบัน
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ 
          success: false, 
          message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' 
        });
      }

      // เข้ารหัสรหัสผ่านใหม่
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedPassword;
    }

    // อัพเดตข้อมูลอื่นๆ
    if (ShopCode !== undefined) user.ShopCode = ShopCode;
    if (ShopName !== undefined) user.ShopName = ShopName;
    if (employees !== undefined) user.employees = employees;

    await user.save();

    res.json({
      success: true,
      message: 'อัพเดตข้อมูลสำเร็จ',
      data: {
        email: user.email,
        productId: user.productId,
        productName: user.productName,
        employees: user.employees
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'เกิดข้อผิดพลาดในการอัพเดตข้อมูล' 
    });
  }
});

// แก้ไขข้อมูลล็อต
app.put('/products/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { lotDate, cost } = req.body;

    const product = await Product.findById(productId);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบล็อตสินค้า'
      });
    }

    // อัพเดตข้อมูล
    product.lotDate = lotDate;
    product.cost = Number(cost);
    
    await product.save();

    res.json({
      success: true,
      message: 'อัพเดตล็อตสินค้าสำเร็จ',
      data: product
    });

  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการอัพเดตข้อมูล'
    });
  }
});

// ลบล็อตสินค้า
app.delete('/products/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await Product.findById(productId);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบล็อตสินค้า'
      });
    }

    // ลบล็อตสินค้า
    await Product.findByIdAndDelete(productId);

    res.json({
      success: true,
      message: 'ลบล็อตสินค้าสำเร็จ'
    });

  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการลบข้อมูล'
    });
  }
});

//แก้ไขรายการสินค้า
app.put('/products/:productId/item', upload.single('image'), async (req, res) => {
  let uploadStream;
  try {
    const { productId } = req.params;
    const { productName, category, price, quantity, productItemId } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบล็อตสินค้า'
      });
    }

    // Find the product item to update
    const productItem = product.listProduct.id(productItemId);
    if (!productItem) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบสินค้าที่ต้องการแก้ไข'
      });
    }

    // Handle image upload if a new image is provided
    let imageId = productItem.image; // Keep existing image by default
    if (req.file) {
      // Upload new image
      const filename = `${Date.now()}-${req.file.originalname}`;
      uploadStream = gfs.openUploadStream(filename, {
        contentType: req.file.mimetype
      });
      imageId = uploadStream.id;

      await new Promise((resolve, reject) => {
        uploadStream.on('finish', resolve);
        uploadStream.on('error', reject);
        uploadStream.end(req.file.buffer);
      });

      // Delete old image if it exists
      if (productItem.image) {
        try {
          await gfs.delete(new mongoose.Types.ObjectId(productItem.image));
        } catch (deleteError) {
          console.error('Error deleting old image:', deleteError);
        }
      }
    }

    // Update product item fields
    productItem.name = productName;
    productItem.category = category;
    productItem.price = Number(price);
    productItem.quantity = Number(quantity);
    if (imageId) {
      productItem.image = imageId;
    }

    await product.save();

    res.json({
      success: true,
      message: 'อัพเดตข้อมูลสินค้าสำเร็จ',
      data: product
    });

  } catch (error) {
    // Handle cleanup if image upload failed
    if (uploadStream && uploadStream.id) {
      try {
        await gfs.delete(uploadStream.id);
      } catch (deleteError) {
        console.error('Error deleting failed upload:', deleteError);
      }
    }

    console.error('Error updating product item:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'เกิดข้อผิดพลาดในการอัพเดตข้อมูล'
    });
  }
});

//ลบรายการสินค้า
app.delete('/products/:productId/item/:itemId', async (req, res) => {
  try {
    const { productId, itemId } = req.params;

    // Find the product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบล็อตสินค้า'
      });
    }

    // Find the product item index
    const itemIndex = product.listProduct.findIndex(
      item => item._id.toString() === itemId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบสินค้าที่ต้องการลบ'
      });
    }

    // Get the item to access its image ID before removal
    const itemToDelete = product.listProduct[itemIndex];

    // Remove the item from the array
    product.listProduct.splice(itemIndex, 1);
    await product.save();

    // Delete the associated image if it exists
    if (itemToDelete.image) {
      try {
        await gfs.delete(new mongoose.Types.ObjectId(itemToDelete.image));
      } catch (deleteError) {
        console.error('Error deleting image:', deleteError);
        // Continue execution even if image deletion fails
      }
    }

    res.json({
      success: true,
      message: 'ลบสินค้าสำเร็จ'
    });

  } catch (error) {
    console.error('Error deleting product item:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการลบสินค้า'
    });
  }
});

// Server startup
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));