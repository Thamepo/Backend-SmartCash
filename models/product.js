const mongoose = require('mongoose');

const ListProductSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  category: { 
    type: String, 
    required: true 
  },
  price: { 
    type: Number, 
    required: true 
  },
  itemCost: { 
    type: Number, 
    required: true 
  },
  image: { 
    type: String,  // สำหรับเก็บ path หรือ URL ของรูปภาพ
    required: true
  },
  quantity: { 
    type: Number, 
    default: 0, 
    required: true ,
  },
  barcode: { 
    type: String,
    required: false  // เปลี่ยนเป็น false เพราะอาจจะไม่มีบาร์โค้ด
  }
});

const ProductSchema = new mongoose.Schema({
  lotDate: { 
    type: Date, 
    required: true 
  },
  listProduct: [ListProductSchema]  // Array ของสินค้า
}, {
  timestamps: true  // เพิ่ม createdAt และ updatedAt
});

module.exports = mongoose.model('Product', ProductSchema);
