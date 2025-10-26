// email-service.js
// Email notification functions using Resend
// Place this file in the same directory as server.js

const { Resend } = require('resend');

// Initialize Resend with your API key from environment variables
const resend = new Resend(process.env.RESEND_API_KEY);

// Your admin email (where you want to receive notifications)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'petervoth@gmail.com';

// Your "from" email (must be verified in Resend)
// For testing, Resend provides: onboarding@resend.dev
// For production, use your own domain: ads@pulsevote.org
const FROM_EMAIL = process.env.FROM_EMAIL || 'ads@pulsevote.org';

/**
 * Send notification to admin when a new ad is submitted
 */
async function sendAdminNotification(adSubmission) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: '🎯 New Ad Submission - PulseVote',
      html: `
        <h2>New Ad Submission Received</h2>
        <p>A new advertisement has been submitted and is awaiting your review.</p>
        
        <hr />
        
        <h3>Submission Details:</h3>
        <ul>
          <li><strong>Company:</strong> ${adSubmission.company_name}</li>
          <li><strong>Ad Text:</strong> ${adSubmission.ad_text}</li>
          <li><strong>Link:</strong> <a href="${adSubmission.link_url}">${adSubmission.link_url}</a></li>
          <li><strong>Buyer Email:</strong> ${adSubmission.buyer_email}</li>
          <li><strong>Duration:</strong> ${adSubmission.duration_days} days</li>
          <li><strong>Amount:</strong> $${(adSubmission.amount_cents / 100).toFixed(2)} USD</li>
          <li><strong>Submission ID:</strong> ${adSubmission.id}</li>
          <li><strong>Submitted:</strong> ${new Date(adSubmission.submitted_at).toLocaleString()}</li>
        </ul>
        
        <p><strong>Ad Image:</strong></p>
        <img src="${adSubmission.image_url}" alt="Ad Banner" style="max-width: 500px; border: 1px solid #ddd;" />
        
        <hr />
        
        <p><a href="https://pulsevote-production.up.railway.app/admin/ads" style="background: #0b63a4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Review in Admin Panel</a></p>
        
        <p style="color: #666; font-size: 0.9rem; margin-top: 20px;">
          Log in to your admin panel to approve or reject this submission.
        </p>
      `,
    });

    if (error) {
      console.error('❌ Resend error sending admin notification:', error);
      throw error;
    }

    console.log('✅ Admin notification email sent:', data.id);
    return data;
  } catch (error) {
    console.error('❌ Failed to send admin notification:', error);
    throw error;
  }
}

/**
 * Send confirmation to buyer when their ad is submitted
 */
async function sendSubmissionConfirmation(adSubmission) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: adSubmission.buyer_email,
      subject: '✅ Ad Submission Received - PulseVote',
      html: `
        <h2>Thank You for Your Submission!</h2>
        <p>Hi there,</p>
        
        <p>We've received your advertisement submission for <strong>${adSubmission.company_name}</strong> and it's now under review.</p>
        
        <hr />
        
        <h3>Submission Summary:</h3>
        <ul>
          <li><strong>Company:</strong> ${adSubmission.company_name}</li>
          <li><strong>Ad Text:</strong> ${adSubmission.ad_text}</li>
          <li><strong>Duration:</strong> ${adSubmission.duration_days} days</li>
          <li><strong>Amount:</strong> $${(adSubmission.amount_cents / 100).toFixed(2)} USD</li>
          <li><strong>Submission ID:</strong> ${adSubmission.id}</li>
        </ul>
        
        <hr />
        
        <h3>What Happens Next?</h3>
        <ol>
          <li>Our team will review your ad within 24 hours</li>
          <li>We'll check that it meets our quality standards and guidelines</li>
          <li>You'll receive an email with the decision (approved or needs revision)</li>
          <li>If approved, payment will be processed and your ad will go live</li>
        </ol>
        
        <p style="color: #666; font-size: 0.9rem; margin-top: 20px;">
          Questions? Contact us at ads@pulsevote.org
        </p>
        
        <p style="color: #999; font-size: 0.8rem; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 10px;">
          PulseVote - Geo-Social Public Opinion Platform<br />
          This is an automated message. Please do not reply directly to this email.
        </p>
      `,
    });

    if (error) {
      console.error('❌ Resend error sending submission confirmation:', error);
      throw error;
    }

    console.log('✅ Submission confirmation email sent:', data.id);
    return data;
  } catch (error) {
    console.error('❌ Failed to send submission confirmation:', error);
    throw error;
  }
}

/**
 * Send notification to buyer when their ad is approved
 */
async function sendApprovalNotification(adSubmission) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: adSubmission.buyer_email,
      subject: '🎉 Your Ad Has Been Approved - PulseVote',
      html: `
        <h2>Great News! Your Ad is Live! 🎉</h2>
        <p>Hi there,</p>
        
        <p>Your advertisement for <strong>${adSubmission.company_name}</strong> has been approved and is now live on PulseVote!</p>
        
        <hr />
        
        <h3>Ad Campaign Details:</h3>
        <ul>
          <li><strong>Company:</strong> ${adSubmission.company_name}</li>
          <li><strong>Ad Text:</strong> ${adSubmission.ad_text}</li>
          <li><strong>Duration:</strong> ${adSubmission.duration_days} days</li>
          <li><strong>Amount Charged:</strong> $${(adSubmission.amount_cents / 100).toFixed(2)} USD</li>
          <li><strong>Start Date:</strong> ${new Date(adSubmission.start_date).toLocaleDateString()}</li>
          <li><strong>End Date:</strong> ${new Date(adSubmission.end_date).toLocaleDateString()}</li>
        </ul>
        
        <p><strong>Your ad preview:</strong></p>
        <img src="${adSubmission.image_url}" alt="Ad Banner" style="max-width: 500px; border: 1px solid #ddd; margin: 10px 0;" />
        
        <hr />
        
        <h3>What's Next?</h3>
        <p>✅ Payment has been processed successfully</p>
        <p>✅ Your ad is now appearing in the PulseVote topic feed</p>
        <p>✅ Users will see your ad and can click through to: <a href="${adSubmission.link_url}">${adSubmission.link_url}</a></p>
        
        <p style="background: #e3f2fd; padding: 15px; border-left: 4px solid #0b63a4; margin: 20px 0;">
          💡 <strong>Pro Tip:</strong> Your ad will run for ${adSubmission.duration_days} days. If you'd like to extend or create a new campaign, just submit another ad through our platform!
        </p>
        
        <p>Thank you for advertising with PulseVote! We're excited to help you reach our engaged community.</p>
        
        ${adSubmission.notes ? `
          <hr />
          <p><strong>Reviewer Notes:</strong></p>
          <p style="background: #f5f5f5; padding: 10px; border-radius: 5px;">${adSubmission.notes}</p>
        ` : ''}
        
        <p style="color: #666; font-size: 0.9rem; margin-top: 30px;">
          Questions about your campaign? Contact us at ads@pulsevote.org
        </p>
        
        <p style="color: #999; font-size: 0.8rem; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 10px;">
          PulseVote - Geo-Social Public Opinion Platform<br />
          This is an automated message. Please do not reply directly to this email.
        </p>
      `,
    });

    if (error) {
      console.error('❌ Resend error sending approval notification:', error);
      throw error;
    }

    console.log('✅ Approval notification email sent:', data.id);
    return data;
  } catch (error) {
    console.error('❌ Failed to send approval notification:', error);
    throw error;
  }
}

/**
 * Send notification to buyer when their ad is rejected
 */
async function sendRejectionNotification(adSubmission, rejectionReason) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: adSubmission.buyer_email,
      subject: '⚠️ Ad Submission Update - PulseVote',
      html: `
        <h2>Update on Your Ad Submission</h2>
        <p>Hi there,</p>
        
        <p>Thank you for submitting your advertisement for <strong>${adSubmission.company_name}</strong>. After review, we're unable to approve this ad at this time.</p>
        
        <hr />
        
        <h3>Reason for Non-Approval:</h3>
        <p style="background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0;">
          ${rejectionReason || adSubmission.notes || 'Your ad did not meet our current quality standards or guidelines.'}
        </p>
        
        <hr />
        
        <h3>What You Can Do:</h3>
        <ol>
          <li><strong>Review our advertising guidelines</strong> to ensure your ad meets our standards</li>
          <li><strong>Make necessary adjustments</strong> to your ad content or creative</li>
          <li><strong>Resubmit your ad</strong> through the PulseVote platform</li>
        </ol>
        
        <p><strong>Important:</strong> No payment has been charged for this submission. You're welcome to submit a revised ad at any time.</p>
        
        <hr />
        
        <h3>Submission Details:</h3>
        <ul>
          <li><strong>Company:</strong> ${adSubmission.company_name}</li>
          <li><strong>Ad Text:</strong> ${adSubmission.ad_text}</li>
          <li><strong>Submission ID:</strong> ${adSubmission.id}</li>
        </ul>
        
        <p style="color: #666; font-size: 0.9rem; margin-top: 30px;">
          Have questions about this decision? We're here to help! Contact us at ads@pulsevote.org
        </p>
        
        <p style="color: #999; font-size: 0.8rem; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 10px;">
          PulseVote - Geo-Social Public Opinion Platform<br />
          This is an automated message. Please do not reply directly to this email.
        </p>
      `,
    });

    if (error) {
      console.error('❌ Resend error sending rejection notification:', error);
      throw error;
    }

    console.log('✅ Rejection notification email sent:', data.id);
    return data;
  } catch (error) {
    console.error('❌ Failed to send rejection notification:', error);
    throw error;
  }
}

module.exports = {
  sendAdminNotification,
  sendSubmissionConfirmation,
  sendApprovalNotification,
  sendRejectionNotification,
};