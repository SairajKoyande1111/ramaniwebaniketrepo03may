import nodemailer from "nodemailer";

const ADMIN_EMAIL = "ramanifashion2026@gmail.com";

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

function buildOrderEmailHtml(order: any): string {
  const a = order.shippingAddress || {};
  const items = (order.items || [])
    .map(
      (item: any) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f3e8ee;">${item.name || "Product"}${item.selectedColor ? ` — ${item.selectedColor}` : ""}${item.selectedSize ? ` / Size ${item.selectedSize}` : ""}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3e8ee;text-align:center;">${item.quantity}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3e8ee;text-align:right;">₹${(item.price * item.quantity).toLocaleString("en-IN")}</td>
        </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#fdf2f8;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:30px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(236,72,153,0.1);">
    <div style="background:linear-gradient(135deg,#ec4899,#db2777);padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:22px;letter-spacing:1px;">🛍️ New Order Received</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Ramani Fashion</p>
    </div>
    <div style="padding:28px 32px;">
      <table style="width:100%;margin-bottom:20px;">
        <tr>
          <td style="color:#6b7280;font-size:13px;">Order Number</td>
          <td style="font-weight:bold;color:#111;text-align:right;">${order.orderNumber || "—"}</td>
        </tr>
        <tr>
          <td style="color:#6b7280;font-size:13px;padding-top:6px;">Payment Method</td>
          <td style="font-weight:bold;color:#111;text-align:right;padding-top:6px;">${order.paymentMethod === "phonepe" ? "PhonePe (Online)" : "Cash on Delivery"}</td>
        </tr>
        <tr>
          <td style="color:#6b7280;font-size:13px;padding-top:6px;">Total Amount</td>
          <td style="font-weight:bold;color:#ec4899;font-size:18px;text-align:right;padding-top:6px;">₹${(order.totalAmount || 0).toLocaleString("en-IN")}</td>
        </tr>
      </table>

      <h3 style="margin:0 0 12px;font-size:14px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Order Items</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <thead>
          <tr style="background:#fdf2f8;">
            <th style="padding:8px 12px;text-align:left;font-size:13px;color:#6b7280;">Item</th>
            <th style="padding:8px 12px;text-align:center;font-size:13px;color:#6b7280;">Qty</th>
            <th style="padding:8px 12px;text-align:right;font-size:13px;color:#6b7280;">Price</th>
          </tr>
        </thead>
        <tbody>${items}</tbody>
      </table>

      <h3 style="margin:0 0 12px;font-size:14px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Shipping Address</h3>
      <div style="background:#fdf2f8;border-radius:8px;padding:16px;font-size:14px;line-height:1.7;color:#374151;">
        <strong>${a.fullName || ""}</strong><br/>
        ${a.address || ""}${a.locality ? ", " + a.locality : ""}<br/>
        ${a.landmark ? "Landmark: " + a.landmark + "<br/>" : ""}
        ${a.city || ""}, ${a.state || ""} – ${a.pincode || ""}<br/>
        📞 ${a.phone || ""}
      </div>
    </div>
    <div style="background:#fdf2f8;padding:16px 32px;text-align:center;font-size:12px;color:#9ca3af;">
      Ramani Fashion Admin Panel · ramanifashion2026@gmail.com
    </div>
  </div>
</body>
</html>`;
}

export async function sendNewOrderEmail(order: any): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    console.log("[Email] GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping order email.");
    return;
  }
  try {
    await transporter.sendMail({
      from: `"Ramani Fashion" <${process.env.GMAIL_USER}>`,
      to: ADMIN_EMAIL,
      subject: `New Order ${order.orderNumber} — ₹${(order.totalAmount || 0).toLocaleString("en-IN")}`,
      html: buildOrderEmailHtml(order),
    });
    console.log(`[Email] Order confirmation sent for ${order.orderNumber}`);
  } catch (err: any) {
    console.error("[Email] Failed to send order email:", err.message);
  }
}
