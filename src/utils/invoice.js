const PDFDocument = require('pdfkit');

const generateInvoice = (order, res) => {
    // Margin 0 to allow full control, but we'll use padding internally
    const doc = new PDFDocument({ margin: 30, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
        'Content-Disposition',
        `attachment; filename=invoice-${order._id}.pdf`
    );

    doc.pipe(res);

    // --- Header ---
    doc.fillColor("#444444")
        .fontSize(20)
        .text("INVOICE", { align: "center" })
        .fontSize(10)
        .text("Ketalog", { align: "center" });

    doc.moveDown();

    // Horizontal Line
    doc.strokeColor("#aaaaaa").lineWidth(1).moveTo(30, doc.y).lineTo(565, doc.y).stroke();
    doc.moveDown();

    const startY = doc.y;

    // --- Order Details (Left) ---
    doc.fontSize(10).fillColor("#000000");
    doc.text(`Order ID: ${order._id}`, 30, startY);
    doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, 30, startY + 15);
    doc.text(`Payment Mode: ${order.paymentMode || order.paymentType || "COD"}`, 30, startY + 30);
    doc.text(`Status: ${order.orderStatus}`, 30, startY + 45);

    // --- Seller Details (Right) - Dynamic Height Calculation to prevent overlap ---
    const seller = order.sellerId || {};
    let rightY = startY;
    const rightX = 300;
    const rightW = 265;

    doc.text("Sold By:", rightX, rightY, { align: 'right', width: rightW });
    rightY += 15;

    doc.font('Helvetica-Bold').text(seller.shopName || "Seller Shop", rightX, rightY, { align: 'right', width: rightW });
    rightY += doc.heightOfString(seller.shopName || "Seller Shop", { width: rightW }) + 2;

    const sellerAddr = seller.address || "Seller Address Not Available";
    doc.font('Helvetica').text(sellerAddr, rightX, rightY, { align: 'right', width: rightW });
    rightY += doc.heightOfString(sellerAddr, { width: rightW }) + 2;

    if (seller.mobile) {
        doc.text(`Mob: ${seller.mobile}`, rightX, rightY, { align: 'right', width: rightW });
        rightY += 15;
    }

    // Google Map Link
    if (seller.lat && seller.lng) {
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${seller.lat},${seller.lng}`;
        rightY += 5; // spacing
        doc.fillColor('blue')
            .text("Shop address", rightX, rightY, {
                align: 'right',
                width: rightW,
                link: mapUrl,
                underline: true
            })
            .fillColor('black'); // Reset
    }

    doc.y = Math.max(doc.y, rightY) + 30; // Move down below the tallest column

    // --- Shipping Address ---
    doc.font('Helvetica-Bold').text("Shipping Address:", 30);
    doc.font('Helvetica');
    // Handle both string and structure
    const addr = order.address || {};
    if (typeof addr === 'string') {
        doc.text(addr, { width: 250 });
    } else {
        const fullAddr = [
            addr.fullAddress,
            addr.city,
            addr.state,
            addr.pincode,
            addr.mobile ? `Mob: ${addr.mobile}` : '',
        ].filter(Boolean).join(', ');
        // If empty, try values (fallback)
        const textAddr = fullAddr || Object.values(addr).filter(Boolean).join(", ");
        doc.text(textAddr, { width: 535 });
    }

    doc.moveDown(2);

    // --- Items Table Header ---
    const tableTop = doc.y;
    doc.font('Helvetica-Bold');
    doc.text("Item", 30, tableTop);
    doc.text("Qty", 350, tableTop);
    doc.text("Price", 400, tableTop);
    doc.text("Total", 500, tableTop);

    doc.strokeColor("#aaaaaa").lineWidth(1).moveTo(30, tableTop + 15).lineTo(565, tableTop + 15).stroke();

    // --- Items List ---
    let y = tableTop + 25;
    doc.font('Helvetica');

    order.items.forEach((i) => {
        const title = i.product ? i.product.title : "Unknown Product";
        const quantity = i.quantity || 0;
        const total = i.price * quantity;

        // Sanitize title to remove non-ASCII characters (often causes garbage in PDFKit standard fonts)
        // e.g. "Gobhi / गोभी" -> "Gobhi / "
        let sanitizedTitle = title.replace(/[^\x00-\x7F]/g, "").trim();

        // Remove trailing " /" or "/" if it was left behind
        if (sanitizedTitle.endsWith("/")) {
            sanitizedTitle = sanitizedTitle.slice(0, -1).trim();
        }

        // Display Product Name and Quantity explicitly as requested
        const itemText = `${sanitizedTitle} (Qty: ${quantity})`;

        doc.text(itemText, 30, y, { width: 310, lineBreak: false, ellipsis: true });
        doc.text(quantity.toString(), 350, y);
        doc.text(`₹${i.price}`, 400, y);
        doc.text(`₹${total}`, 500, y);

        y += 20;
    });

    doc.moveDown();
    doc.strokeColor("#aaaaaa").lineWidth(1).moveTo(30, y).lineTo(565, y).stroke();

    // --- Total ---
    y += 10;

    // --- Total ---
    y += 10;

    // Calculate gross subtotal from items
    const grossSubtotal = order.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const shipping = order.shippingCharge || 0;
    const discount = order.discountAmount || 0;
    // We strive to match order.totalAmount.
    // Mathematical check: correctTotal = grossSubtotal + shipping - discount

    doc.font('Helvetica').fontSize(10);

    // 1. Gross Subtotal
    doc.text(`Subtotal: ₹${grossSubtotal}`, 300, y, { align: 'right', width: 265 });
    y += 15;

    // 2. Discount (if any)
    if (discount > 0) {
        const discountLabel = order.couponCode ? `Discount (${order.couponCode}):` : `Discount:`;
        doc.fillColor('red').text(`${discountLabel} -₹${discount}`, 300, y, { align: 'right', width: 265 }).fillColor('black');
        y += 15;

        // Show discount remark if available
        if (order.discountRemark) {
            doc.fontSize(8).fillColor('#666666')
                .text(`(${order.discountRemark})`, 300, y, { align: 'right', width: 265 })
                .fillColor('black').fontSize(10);
            y += 15;
        }
    }

    // 3. Shipping
    doc.text(`Shipping: ₹${shipping}`, 300, y, { align: 'right', width: 265 });
    y += 20;

    doc.font('Helvetica-Bold').fontSize(14);
    doc.text(`Total Amount: ₹${order.totalAmount}`, 300, y, { align: 'right', width: 265 });

    // Footer
    doc.fontSize(8).fillColor("#777777");
    doc.text("Thank you for your business.", 30, 780, { align: "center", width: 535 });

    doc.end();
};

module.exports = { generateInvoice };