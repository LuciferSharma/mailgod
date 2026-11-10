export interface TemplatePreset {
  name: string;
  subject: string;
  category: string;
  html: string;
}

const responsiveHead = `<meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!--[if !mso]><!-->
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <!--<![endif]-->
  <style>
    /* Reset */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; }

    /* Mobile */
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; max-width: 100% !important; }
      .mobile-padding { padding-left: 20px !important; padding-right: 20px !important; }
      .mobile-padding-sm { padding-left: 16px !important; padding-right: 16px !important; }
      .mobile-full { width: 100% !important; display: block !important; }
      .mobile-center { text-align: center !important; }
      .mobile-hide { display: none !important; }
      .mobile-text-lg { font-size: 20px !important; }
      .mobile-text-md { font-size: 15px !important; }
      .mobile-stack { display: block !important; width: 100% !important; }
      .mobile-btn { width: 100% !important; }
      .mobile-btn td { padding: 14px 20px !important; text-align: center !important; }
    }
  </style>`;

export const templatePresets: TemplatePreset[] = [
  {
    name: 'Welcome Email',
    subject: 'Welcome to {{product_name}}!',
    category: 'onboarding',
    html: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  ${responsiveHead}
  <title>Welcome</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td class="mobile-padding" style="background:#2563eb;padding:32px 40px;text-align:center;">
              <h1 class="mobile-text-lg" style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">Welcome to {{product_name}}</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="mobile-padding" style="padding:36px 40px 40px;">
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">
                Hi {{name}},
              </p>
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 28px;">
                Thanks for signing up! We're excited to have you on board. Here is everything you need to get started.
              </p>

              <!-- CTA -->
              <table role="presentation" class="mobile-btn" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#2563eb;border-radius:6px;padding:14px 32px;text-align:center;">
                    <a href="{{website_url}}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;display:inline-block;">
                      Get Started
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color:#6b7280;font-size:14px;line-height:1.5;margin:0;">
                If you have any questions, just reply to this email. We're here to help!
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="mobile-padding" style="background:#f9fafb;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:0;">
                {{product_name}} &middot; <a href="{{unsubscribe_url}}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    name: 'Newsletter',
    subject: '{{product_name}} Weekly Update',
    category: 'marketing',
    html: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  ${responsiveHead}
  <title>Newsletter</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td class="mobile-padding" style="padding:28px 40px;border-bottom:1px solid #e5e7eb;">
              <h1 style="color:#111827;margin:0;font-size:20px;font-weight:700;">{{product_name}} Weekly</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="mobile-padding" style="padding:32px 40px;">
              <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 8px;">
                Hi {{name}},
              </p>
              <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
                Here's what's new this week at {{product_name}}. We've been working hard on features to help you get more done, faster.
              </p>

              <!-- CTA -->
              <table role="presentation" class="mobile-btn" cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background:#2563eb;border-radius:6px;padding:12px 28px;text-align:center;">
                    <a href="{{website_url}}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;display:inline-block;">
                      See What's New
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr><td style="border-top:1px solid #e5e7eb;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <h3 style="color:#111827;font-size:16px;margin:0 0 14px;font-weight:600;">Quick Updates</h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:8px 0;color:#374151;font-size:14px;line-height:1.6;">
                    <span style="color:#2563eb;margin-right:8px;">&#8226;</span> Smarter automations with branching flows
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#374151;font-size:14px;line-height:1.6;">
                    <span style="color:#2563eb;margin-right:8px;">&#8226;</span> One-click integrations with your favorite tools
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#374151;font-size:14px;line-height:1.6;">
                    <span style="color:#2563eb;margin-right:8px;">&#8226;</span> Performance dashboard with engagement analytics
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="mobile-padding" style="background:#f9fafb;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:0;">
                {{product_name}} &middot; <a href="{{unsubscribe_url}}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    name: 'Re-engagement',
    subject: 'We miss you, {{name}}!',
    category: 'reactivation',
    html: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  ${responsiveHead}
  <title>We Miss You</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
          <!-- Body -->
          <tr>
            <td class="mobile-padding" style="padding:48px 40px;text-align:center;">
              <p style="font-size:48px;margin:0 0 20px;line-height:1;">&#128075;</p>
              <h1 class="mobile-text-lg" style="color:#111827;font-size:24px;margin:0 0 12px;font-weight:700;">We miss you, {{name}}!</h1>
              <p style="color:#6b7280;font-size:15px;line-height:1.6;margin:0 0 8px;">
                It's been a while since you visited {{product_name}}.
              </p>
              <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 32px;">
                We've shipped some exciting updates since your last visit — come back and check them out.
              </p>

              <!-- Feature card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td class="mobile-padding-sm" style="background:#f0f9ff;border-radius:8px;padding:24px;text-align:left;">
                    <p style="color:#1e40af;font-size:14px;font-weight:bold;margin:0 0 8px;">What's New</p>
                    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0;">New templates, faster workflows, and a completely redesigned dashboard — all built to help you do your best work.</p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table role="presentation" class="mobile-btn" cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
                <tr>
                  <td style="background:#2563eb;border-radius:6px;padding:14px 32px;text-align:center;">
                    <a href="{{website_url}}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;display:inline-block;">
                      Come Back &amp; Explore
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="mobile-padding" style="background:#f9fafb;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:0;">
                {{product_name}} &middot; <a href="{{unsubscribe_url}}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`,
  },
  {
    name: 'Upgrade / Upsell',
    subject: 'Unlock more with {{product_name}} Pro',
    category: 'marketing',
    html: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  ${responsiveHead}
  <title>Upgrade</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
          <!-- Hero -->
          <tr>
            <td class="mobile-padding" style="background:linear-gradient(135deg,#7c3aed,#2563eb);padding:40px;text-align:center;">
              <h1 class="mobile-text-lg" style="color:#ffffff;margin:0 0 8px;font-size:26px;font-weight:700;">Go Pro</h1>
              <p style="color:#e0e7ff;font-size:15px;line-height:1.5;margin:0;">Unlock the full power of {{product_name}}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="mobile-padding" style="padding:36px 40px 40px;">
              <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 28px;">
                Hi {{name}}, you've been doing great with {{product_name}}! Here's what you'll get with Pro:
              </p>

              <!-- Features list -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="padding:14px 16px;border-bottom:1px solid #f3f4f6;">
                    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                      <td style="width:28px;vertical-align:top;"><span style="color:#059669;font-size:18px;">&#10003;</span></td>
                      <td style="color:#374151;font-size:14px;line-height:1.5;">Unlimited projects per month</td>
                    </tr></table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 16px;border-bottom:1px solid #f3f4f6;">
                    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                      <td style="width:28px;vertical-align:top;"><span style="color:#059669;font-size:18px;">&#10003;</span></td>
                      <td style="color:#374151;font-size:14px;line-height:1.5;">Priority support from a real human</td>
                    </tr></table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 16px;">
                    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                      <td style="width:28px;vertical-align:top;"><span style="color:#059669;font-size:18px;">&#10003;</span></td>
                      <td style="color:#374151;font-size:14px;line-height:1.5;">Priority rendering and custom branding</td>
                    </tr></table>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table role="presentation" class="mobile-btn" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="background:#7c3aed;border-radius:6px;padding:14px 36px;text-align:center;">
                    <a href="{{website_url}}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;display:inline-block;">
                      Upgrade Now
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="mobile-padding" style="background:#f9fafb;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:0;">
                {{product_name}} &middot; <a href="{{unsubscribe_url}}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`,
  },
];
