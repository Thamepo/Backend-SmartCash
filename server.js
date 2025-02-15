app.get('/dashboard/:monthYear', async (req, res) => {
  try {
    const { monthYear } = req.params;
    const [month, year] = monthYear.split('-').map(Number);
    
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);

    console.log('Date range:', { startDate, endDate });

    // ดึงข้อมูล orders
    const orders = await Order.find({
      orderDate: {
        $gte: startDate,
        $lte: endDate
      }
    });

    // สร้าง object เก็บข้อมูล
    let totalSales = 0;
    let totalCost = 0;
    let totalProfit = 0;
    const dailySales = {};
    const dailyCosts = {};
    const dailyProfits = {};

    // วนลูปผ่านแต่ละ order
    for (const order of orders) {
      const dayKey = new Date(order.orderDate).getDate().toString();
      
      // เตรียมข้อมูลรายวัน
      if (!dailySales[dayKey]) {
        dailySales[dayKey] = 0;
        dailyCosts[dayKey] = 0;
        dailyProfits[dayKey] = 0;
      }

      // คำนวณข้อมูลจากแต่ละ item
      for (const item of order.items) {
        // ดึงข้อมูล itemCost จาก Product Collection
        const product = await Product.findOne({
          "listProduct._id": item.barcode
        });

        if (product) {
          const productItem = product.listProduct.find(p => 
            p._id.toString() === item.barcode
          );

          if (productItem) {
            const itemSales = item.price * item.quantity;
            const itemCost = productItem.itemCost * item.quantity;
            const itemProfit = itemSales - itemCost;

            // เพิ่มยอดรายวัน
            dailySales[dayKey] += itemSales;
            dailyCosts[dayKey] += itemCost;
            dailyProfits[dayKey] += itemProfit;

            // เพิ่มยอดรวม
            totalSales += itemSales;
            totalCost += itemCost;
            totalProfit += itemProfit;
          }
        }
      }
    }

    console.log('Daily calculations:', {
      sales: dailySales,
      costs: dailyCosts,
      profits: dailyProfits
    });

    console.log('Total calculations:', {
      totalSales,
      totalCost,
      totalProfit
    });

    res.json({
      success: true,
      data: {
        totalSales,
        totalCost,
        totalProfit,
        dailySales,
        dailyCosts,
        dailyProfits,
        topProducts: [], // อาจจะเพิ่มการคำนวณ topProducts ในภายหลัง
        orderCount: orders.length
      }
    });

  } catch (error) {
    console.error('Error calculating dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการคำนวณข้อมูล Dashboard'
    });
  }
});
