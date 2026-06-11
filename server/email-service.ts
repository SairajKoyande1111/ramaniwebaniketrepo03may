import nodemailer from "nodemailer";

const ADMIN_EMAIL = "ramanifashion2026@gmail.com";
const GMAIL_USER = process.env.GMAIL_USER || "ramanifashion2026@gmail.com";
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || "jiklrptppoitanrp";
const HOST_URL = process.env.HOST_URL || "https://ramanifashion.in";

function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
}

function resolveImageUrl(image: string | undefined): string {
  if (!image) return "";
  if (image.startsWith("http://") || image.startsWith("https://")) return image;
  return `${HOST_URL}${image.startsWith("/") ? "" : "/"}${image}`;
}

function buildOrderEmailHtml(order: any): string {
  const a = order.shippingAddress || {};

  const subtotal = order.subtotal || 0;
  const shipping = order.shippingCharges || 0;
  const discount = order.discount || 0;
  const total = order.total || 0;

  const paymentLabel =
    order.paymentMethod === "phonepe"
      ? "PhonePe (Online)"
      : order.paymentMethod === "cod"
      ? "Cash on Delivery"
      : order.paymentMethod || "—";

  const items = (order.items || [])
    .map((item: any) => {
      const imgUrl = resolveImageUrl(item.image);
      const imgCell = imgUrl
        ? `<img src="${imgUrl}" alt="${item.name}" width="64" height="64"
             style="width:64px;height:64px;object-fit:cover;border-radius:8px;display:block;border:1px solid #f3e8ee;" />`
        : `<div style="width:64px;height:64px;border-radius:8px;background:#fdf2f8;display:flex;align-items:center;justify-content:center;font-size:22px;">🛍️</div>`;

      const itemTotal = (item.price || 0) * (item.quantity || 1);
      const meta = [item.selectedColor, item.selectedSize ? `Size: ${item.selectedSize}` : null]
        .filter(Boolean)
        .join(" · ");

      return `
        <tr>
          <td style="padding:14px 16px;border-bottom:1px solid #f3e8ee;vertical-align:middle;">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td style="padding-right:14px;vertical-align:middle;">${imgCell}</td>
                <td style="vertical-align:middle;">
                  <div style="font-size:14px;font-weight:600;color:#111827;margin-bottom:3px;">${item.name || "Product"}</div>
                  ${meta ? `<div style="font-size:12px;color:#9ca3af;">${meta}</div>` : ""}
                </td>
              </tr>
            </table>
          </td>
          <td style="padding:14px 16px;border-bottom:1px solid #f3e8ee;text-align:center;vertical-align:middle;font-size:14px;color:#374151;">${item.quantity || 1}</td>
          <td style="padding:14px 16px;border-bottom:1px solid #f3e8ee;text-align:right;vertical-align:middle;font-size:14px;color:#374151;">₹${(item.price || 0).toLocaleString("en-IN")}</td>
          <td style="padding:14px 16px;border-bottom:1px solid #f3e8ee;text-align:right;vertical-align:middle;font-size:14px;font-weight:600;color:#111827;">₹${itemTotal.toLocaleString("en-IN")}</td>
        </tr>`;
    })
    .join("");

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>New Order – Ramani Fashion</title>
</head>
<body style="margin:0;padding:0;background:#f9f3f7;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background:#f9f3f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="620" border="0" cellspacing="0" cellpadding="0" style="max-width:620px;width:100%;">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#ec4899 0%,#be185d 100%);border-radius:16px 16px 0 0;padding:36px 40px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:2px;margin-bottom:6px;">Ramani Fashion</div>
                    <div style="font-size:26px;font-weight:700;color:#ffffff;margin-bottom:4px;">New Order Received 🛍️</div>
                    <div style="font-size:13px;color:rgba(255,255,255,0.75);">${dateStr}</div>
                  </td>
                  <td align="right" style="vertical-align:top;">
                    <div style="background:rgba(255,255,255,0.15);border-radius:10px;padding:10px 18px;display:inline-block;">
                      <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-bottom:2px;">ORDER</div>
                      <div style="font-size:16px;font-weight:700;color:#ffffff;">${order.orderNumber || "—"}</div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:#ffffff;padding:0 40px 32px;">

              <!-- ORDER SUMMARY CARDS -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top:28px;margin-bottom:28px;">
                <tr>
                  <td width="33%" style="padding-right:8px;">
                    <div style="background:#fdf2f8;border-radius:10px;padding:16px;text-align:center;">
                      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Payment</div>
                      <div style="font-size:14px;font-weight:700;color:#111827;">${paymentLabel}</div>
                    </div>
                  </td>
                  <td width="33%" style="padding:0 4px;">
                    <div style="background:#fdf2f8;border-radius:10px;padding:16px;text-align:center;">
                      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Items</div>
                      <div style="font-size:14px;font-weight:700;color:#111827;">${(order.items || []).length} item${(order.items || []).length !== 1 ? "s" : ""}</div>
                    </div>
                  </td>
                  <td width="33%" style="padding-left:8px;">
                    <div style="background:linear-gradient(135deg,#fce7f3,#fdf2f8);border-radius:10px;padding:16px;text-align:center;border:1px solid #f9a8d4;">
                      <div style="font-size:11px;color:#be185d;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Total</div>
                      <div style="font-size:18px;font-weight:800;color:#ec4899;">₹${total.toLocaleString("en-IN")}</div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- ORDER ITEMS -->
              <div style="font-size:12px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">Order Items</div>
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border:1px solid #f3e8ee;border-radius:12px;overflow:hidden;border-collapse:separate;border-spacing:0;">
                <thead>
                  <tr style="background:#fdf2f8;">
                    <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #f3e8ee;">Product</th>
                    <th style="padding:10px 16px;text-align:center;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #f3e8ee;">Qty</th>
                    <th style="padding:10px 16px;text-align:right;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #f3e8ee;">Unit Price</th>
                    <th style="padding:10px 16px;text-align:right;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #f3e8ee;">Amount</th>
                  </tr>
                </thead>
                <tbody>${items}</tbody>
              </table>

              <!-- PRICING BREAKDOWN -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top:20px;">
                <tr>
                  <td align="right">
                    <table border="0" cellspacing="0" cellpadding="0" style="min-width:240px;">
                      <tr>
                        <td style="padding:5px 0;font-size:13px;color:#6b7280;">Subtotal</td>
                        <td style="padding:5px 0 5px 32px;font-size:13px;color:#374151;text-align:right;">₹${subtotal.toLocaleString("en-IN")}</td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;font-size:13px;color:#6b7280;">Shipping</td>
                        <td style="padding:5px 0 5px 32px;font-size:13px;color:#374151;text-align:right;">${shipping === 0 ? '<span style="color:#16a34a;font-weight:600;">FREE</span>' : `₹${shipping.toLocaleString("en-IN")}`}</td>
                      </tr>
                      ${discount > 0 ? `
                      <tr>
                        <td style="padding:5px 0;font-size:13px;color:#6b7280;">Discount</td>
                        <td style="padding:5px 0 5px 32px;font-size:13px;color:#16a34a;text-align:right;font-weight:600;">−₹${discount.toLocaleString("en-IN")}</td>
                      </tr>` : ""}
                      <tr>
                        <td colspan="2" style="padding:10px 0 0;"><div style="border-top:2px solid #f3e8ee;"></div></td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0 0;font-size:15px;font-weight:700;color:#111827;">Total</td>
                        <td style="padding:8px 0 0 32px;font-size:18px;font-weight:800;color:#ec4899;text-align:right;">₹${total.toLocaleString("en-IN")}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SHIPPING ADDRESS -->
              <div style="font-size:12px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;margin:28px 0 12px;">Shipping Address</div>
              <div style="background:#fdf2f8;border-radius:12px;padding:20px 24px;font-size:14px;line-height:1.8;color:#374151;border-left:4px solid #ec4899;">
                <div style="font-weight:700;font-size:15px;color:#111827;margin-bottom:4px;">${a.fullName || ""}</div>
                <div>${a.address || ""}${a.locality ? ", " + a.locality : ""}</div>
                ${a.landmark ? `<div style="color:#9ca3af;font-size:13px;">Landmark: ${a.landmark}</div>` : ""}
                <div>${a.city || ""}, ${a.state || ""} – ${a.pincode || ""}</div>
                <div style="margin-top:6px;">
                  <span style="background:#ec4899;color:#fff;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:600;">📞 ${a.phone || ""}</span>
                </div>
              </div>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#1f1f1f;border-radius:0 0 16px 16px;padding:24px 40px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size:14px;font-weight:700;color:#ffffff;margin-bottom:4px;">Ramani Fashion</div>
                    <div style="font-size:12px;color:#6b7280;">Admin Panel · ramanifashion2026@gmail.com</div>
                  </td>
                  <td align="right">
                    <div style="font-size:11px;color:#4b5563;">This is an automated notification</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendNewOrderEmail(order: any): Promise<void> {
  const transporter = getTransporter();
  const total = order.total || 0;
  try {
    await transporter.sendMail({
      from: `"Ramani Fashion" <${GMAIL_USER}>`,
      to: ADMIN_EMAIL,
      subject: `🛍️ New Order ${order.orderNumber || ""} — ₹${total.toLocaleString("en-IN")}`,
      html: buildOrderEmailHtml(order),
    });
    console.log(`[Email] Order notification sent for ${order.orderNumber}`);
  } catch (err: any) {
    console.error("[Email] Failed to send order email:", err.message);
  }
}
