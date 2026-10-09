/**
 * Seed Script for LiveMail Classifier
 * Trains the Bayes Classifier with keyword-rich datasets for all 7 categories
 * Run with: npm run seed
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const connectDB = require('./config/database');
const Email = require('./models/Email');
const { initializeClassifier, trainClassifier, saveClassifier } = require('./services/classifier');

// Training data for all 7 categories
const trainingData = [
    // ==================== PERSONAL ====================
    {
        text: 'Hey, are you free this weekend? Want to grab lunch and catch up?',
        category: 'Personal'
    },
    {
        text: 'Happy birthday! Hope you have an amazing day filled with joy and laughter',
        category: 'Personal'
    },
    {
        text: 'Thanks for coming to the party last night, it was so much fun!',
        category: 'Personal'
    },
    {
        text: 'Mom called, she wants us to come over for dinner on Sunday',
        category: 'Personal'
    },
    {
        text: 'Let me know if you want to go to the movies tonight',
        category: 'Personal'
    },
    {
        text: 'I found some old photos from our vacation, sending them your way',
        category: 'Personal'
    },
    {
        text: 'Can you pick up some groceries on your way home?',
        category: 'Personal'
    },
    {
        text: 'Hope you feel better soon, let me know if you need anything',
        category: 'Personal'
    },
    {
        text: 'Wedding invitation - Sarah and John are getting married!',
        category: 'Personal'
    },
    {
        text: 'Family reunion next month, please RSVP by Friday',
        category: 'Personal'
    },
    {
        text: 'Miss you so much, when are you visiting?',
        category: 'Personal'
    },
    {
        text: 'Thanks for the lovely dinner invitation, we had a great time',
        category: 'Personal'
    },
    {
        text: 'Your friend request has been accepted on Facebook',
        category: 'Personal'
    },
    {
        text: 'Reminder: dentist appointment tomorrow at 3pm',
        category: 'Personal'
    },
    {
        text: 'Gym membership renewal notice - your monthly subscription',
        category: 'Personal'
    },

    // ==================== BUSINESS ====================
    {
        text: 'Quarterly business review meeting scheduled for next Tuesday at 10am',
        category: 'Business'
    },
    {
        text: 'Partnership proposal - exploring strategic collaboration opportunities',
        category: 'Business'
    },
    {
        text: 'Board meeting agenda and materials attached for review',
        category: 'Business'
    },
    {
        text: 'Client presentation feedback and next steps discussion',
        category: 'Business'
    },
    {
        text: 'Vendor contract renewal - please review the terms and conditions',
        category: 'Business'
    },
    {
        text: 'Business development opportunity in the Asian market',
        category: 'Business'
    },
    {
        text: 'Corporate strategy session - Q4 planning and objectives',
        category: 'Business'
    },
    {
        text: 'Stakeholder update on company performance and growth metrics',
        category: 'Business'
    },
    {
        text: 'Merger and acquisition discussion - confidential',
        category: 'Business'
    },
    {
        text: 'Investor relations - annual report and financial statements',
        category: 'Business'
    },
    {
        text: 'Business trip itinerary for the conference next week',
        category: 'Business'
    },
    {
        text: 'Company policy update - new HR guidelines effective immediately',
        category: 'Business'
    },
    {
        text: 'Team restructuring announcement and organizational changes',
        category: 'Business'
    },
    {
        text: 'Client onboarding process and welcome package',
        category: 'Business'
    },
    {
        text: 'Business intelligence report - market analysis and trends',
        category: 'Business'
    },

    // ==================== FINANCE ====================
    {
        text: 'Your monthly bank statement is now available for download',
        category: 'Finance'
    },
    {
        text: 'Tax return filing reminder - deadline approaching April 15th',
        category: 'Finance'
    },
    {
        text: 'Investment portfolio update - quarterly performance report',
        category: 'Finance'
    },
    {
        text: 'Credit card payment due - minimum payment required by due date',
        category: 'Finance'
    },
    {
        text: 'Mortgage statement - your monthly payment breakdown',
        category: 'Finance'
    },
    {
        text: 'Stock dividend notification - reinvestment options available',
        category: 'Finance'
    },
    {
        text: 'Insurance premium payment notice - auto renewal upcoming',
        category: 'Finance'
    },
    {
        text: 'Retirement account contribution limits for this year',
        category: 'Finance'
    },
    {
        text: 'Loan approval notification - terms and interest rate details',
        category: 'Finance'
    },
    {
        text: 'Budget planning spreadsheet for the upcoming fiscal year',
        category: 'Finance'
    },
    {
        text: 'Wire transfer confirmation - international payment processed',
        category: 'Finance'
    },
    {
        text: 'Account balance alert - low balance warning threshold reached',
        category: 'Finance'
    },
    {
        text: 'Financial advisor meeting scheduled - portfolio review session',
        category: 'Finance'
    },
    {
        text: 'Cryptocurrency transaction confirmation and wallet update',
        category: 'Finance'
    },
    {
        text: 'Expense report reimbursement - submit receipts by end of month',
        category: 'Finance'
    },

    // ==================== SECURITY ====================
    {
        text: 'Security alert: unusual login activity detected on your account',
        category: 'Security'
    },
    {
        text: 'Password reset required - your password has expired',
        category: 'Security'
    },
    {
        text: 'Two-factor authentication enabled successfully on your account',
        category: 'Security'
    },
    {
        text: 'Phishing attempt detected - do not click on suspicious links',
        category: 'Security'
    },
    {
        text: 'Account locked due to multiple failed login attempts',
        category: 'Security'
    },
    {
        text: 'Security update available - please install the latest patches',
        category: 'Security'
    },
    {
        text: 'Suspicious activity warning - verify recent transactions',
        category: 'Security'
    },
    {
        text: 'VPN connection established - secure tunnel active',
        category: 'Security'
    },
    {
        text: 'Firewall alert - blocked unauthorized access attempt',
        category: 'Security'
    },
    {
        text: 'Data breach notification - please change your password immediately',
        category: 'Security'
    },
    {
        text: 'SSL certificate expiring soon - renewal required',
        category: 'Security'
    },
    {
        text: 'Malware detected and quarantined by antivirus software',
        category: 'Security'
    },
    {
        text: 'Login verification code - do not share this code with anyone',
        category: 'Security'
    },
    {
        text: 'Privacy policy update - new data protection measures implemented',
        category: 'Security'
    },
    {
        text: 'Encryption key rotation scheduled - system maintenance window',
        category: 'Security'
    },

    // ==================== WORK ====================
    {
        text: 'Project deadline reminder - deliverables due by end of week',
        category: 'Business'
    },
    {
        text: 'Team standup meeting at 9am - please prepare your updates',
        category: 'Business'
    },
    {
        text: 'Performance review scheduled - self-assessment form attached',
        category: 'Business'
    },
    {
        text: 'Sprint planning session - backlog grooming and estimation',
        category: 'Business'
    },
    {
        text: 'Code review feedback - please address the comments and resubmit',
        category: 'Business'
    },
    {
        text: 'Training workshop registration - professional development opportunity',
        category: 'Business'
    },
    {
        text: 'Timesheet submission reminder - log your hours by Friday',
        category: 'Business'
    },
    {
        text: 'IT support ticket resolved - please verify the fix',
        category: 'Business'
    },
    {
        text: 'Office supply order confirmation - delivery scheduled for Monday',
        category: 'Business'
    },
    {
        text: 'Employee handbook update - please review the new policies',
        category: 'Business'
    },
    {
        text: 'PTO request approved - enjoy your time off',
        category: 'Business'
    },
    {
        text: 'Department all-hands meeting - quarterly updates and announcements',
        category: 'Business'
    },
    {
        text: 'Work from home policy guidelines and expectations',
        category: 'Business'
    },
    {
        text: 'Project kickoff meeting invite - new client onboarding',
        category: 'Business'
    },
    {
        text: 'HR benefits enrollment period - review your coverage options',
        category: 'Business'
    },

    // ==================== COLLEGE/SCHOOL ====================
    {
        text: 'Assignment due date reminder - submit your essay by midnight',
        category: 'School / College'
    },
    {
        text: 'Exam schedule released - check your testing times and locations',
        category: 'School / College'
    },
    {
        text: 'Grade report available - view your transcript online',
        category: 'School / College'
    },
    {
        text: 'Course registration opens next week - plan your schedule',
        category: 'School / College'
    },
    {
        text: 'Professor office hours changed to Wednesdays 2-4pm',
        category: 'School / College'
    },
    {
        text: 'Scholarship application deadline approaching - submit all documents',
        category: 'School / College'
    },
    {
        text: 'Campus event - guest lecture on artificial intelligence',
        category: 'School / College'
    },
    {
        text: 'Library fine notice - overdue books must be returned',
        category: 'School / College'
    },
    {
        text: 'Internship opportunity - apply through the career center',
        category: 'School / College'
    },
    {
        text: 'Student ID card renewal - visit the administrative office',
        category: 'School / College'
    },
    {
        text: 'Thesis proposal defense scheduled - committee feedback attached',
        category: 'School / College'
    },
    {
        text: 'Group project meeting - study room reserved in library',
        category: 'School / College'
    },
    {
        text: 'Financial aid disbursement notification - check your student account',
        category: 'School / College'
    },
    {
        text: 'Graduation application deadline - apply to graduate this semester',
        category: 'School / College'
    },
    {
        text: 'Research paper feedback - revisions needed before final submission',
        category: 'School / College'
    },

    // ==================== PROMOTION ====================
    {
        text: 'Limited time offer - 50% off all products this weekend only!',
        category: 'Uncategorized'
    },
    {
        text: 'Flash sale alert - grab your favorites before they sell out',
        category: 'Uncategorized'
    },
    {
        text: 'Exclusive member discount - use code SAVE20 at checkout',
        category: 'Uncategorized'
    },
    {
        text: 'Buy one get one free - special promotion for loyal customers',
        category: 'Uncategorized'
    },
    {
        text: 'New product launch - be the first to try our latest release',
        category: 'Uncategorized'
    },
    {
        text: 'Free shipping on orders over $50 - limited time only',
        category: 'Uncategorized'
    },
    {
        text: 'Subscribe and save - get 15% off your monthly subscription',
        category: 'Uncategorized'
    },
    {
        text: 'Refer a friend and earn rewards - share your unique link',
        category: 'Uncategorized'
    },
    {
        text: 'Seasonal clearance sale - up to 70% off selected items',
        category: 'Uncategorized'
    },
    {
        text: 'Loyalty points doubled - earn more rewards on every purchase',
        category: 'Uncategorized'
    },
    {
        text: 'Black Friday deals preview - early access for subscribers',
        category: 'Uncategorized'
    },
    {
        text: 'Holiday special - gift cards with every purchase over $100',
        category: 'Uncategorized'
    },
    {
        text: 'App download bonus - get $10 off your first mobile order',
        category: 'Uncategorized'
    },
    {
        text: 'Birthday reward - special discount just for you',
        category: 'Uncategorized'
    },
    {
        text: 'Unsubscribe from promotional emails - manage your preferences',
        category: 'Uncategorized'
    },
    // Additional real-world training samples
    {
        text: 'Lunch this week? Hey NANDU, are you free on Friday afternoon for a coffee or a quick lunch? Let me know!',
        category: 'Personal'
    },
    {
        text: 'Happy anniversary to you both! Wishing you a wonderful year ahead filled with love, health and happiness.',
        category: 'Personal'
    },
    {
        text: 'Photos from last Sunday trip - here are all the pictures we took at the beach. Hope you like them!',
        category: 'Personal'
    },
    {
        text: 'Google Meet invitation: Project Sync. You have been invited to a sync call. Join us on Zoom or Google Meet.',
        category: 'Business'
    },
    {
        text: 'Slack notification: Sudeep mentioned you in channel #general. Check your messages to sync up.',
        category: 'Business'
    },
    {
        text: 'PR approved: Pull request #314 completed. Ready for deployment and production code review.',
        category: 'Business'
    },
    {
        text: 'GitHub Verification: Verify your GitHub email address. Enter the verification code 123456 to confirm.',
        category: 'Security'
    },
    {
        text: 'Your Spotify account login attempt. We detected a login attempt from a new device. Reset your password if this was not you.',
        category: 'Security'
    },
    {
        text: 'Security alert: Password changed successfully. Your account password was updated today. If you did not make this change, contact support.',
        category: 'Security'
    },
    {
        text: 'Your Spotify Premium billing receipt. Thank you for subscribing. Premium Standard Standard subscription renewed.',
        category: 'Finance'
    },
    {
        text: 'HDFC Bank transaction alert: INR 799 debited from account for online purchase. Contact customer support if unauthorized.',
        category: 'Finance'
    },
    {
        text: 'Invoice details: Billing statement for August is ready. Total due: $45.00. Payment due date: September 10.',
        category: 'Finance'
    },
    {
        text: 'Strategic partnership proposal - corporate collaboration. We would love to discuss a strategic partnership between our enterprises.',
        category: 'Business'
    },
    {
        text: 'Interview scheduling request: CivicLink hiring team. We reviewed your resume and would like to schedule a recruiter phone interview.',
        category: 'Business'
    },
    {
        text: 'Vendor agreement and service contract renewal. Attached is the revised contract for your review and digital signature.',
        category: 'Business'
    },
    {
        text: 'MY Bharat Quiz: VBYLD 2027 Quiz is now live. Complete the quiz and win exciting campus rewards.',
        category: 'School / College'
    },
    {
        text: 'Assignment submission feedback: Professor Miller graded your homework for Lecture 4. Your student portal is updated.',
        category: 'School / College'
    },
    {
        text: 'University campus registration reminder. Student course enrollment starts tomorrow at 9am. Please review syllabus.',
        category: 'School / College'
    },
    {
        text: 'Get 50% off Creative Cloud Pro. Limited time sale on professional assets. Buy now and stand to win epic prizes!',
        category: 'Uncategorized'
    },
    {
        text: 'Freelance Trainer job opportunities standard digest. Check out the latest freelance jobs popular in your network.',
        category: 'Uncategorized'
    },
    {
        text: 'Celebrating one million nonprofits: Special brand newsletters. Subscribe for exclusive discount coupons and sales.',
        category: 'Uncategorized'
    },

    // ==================== STUDENT (phrase-pattern weighted keywords) ====================
    {
        text: 'Assignment submission deadline tonight - please upload your files to the student portal before midnight.',
        category: 'School / College'
    },
    {
        text: 'Internal examination schedule released - check your internals marks and attendance on the college portal.',
        category: 'School / College'
    },
    {
        text: 'VTU exam results are out - verify your semester marks and download your grade card from the official site.',
        category: 'School / College'
    },
    {
        text: 'Faculty has announced the updated syllabus for the upcoming semester, including project submission guidelines.',
        category: 'School / College'
    },
    {
        text: 'Attendance shortage warning - your attendance is below 75%. Internals marks will be affected if not resolved.',
        category: 'School / College'
    },
    {
        text: 'Semester results declared - log in to the VTU portal to view your marks and download hall ticket.',
        category: 'School / College'
    },
    {
        text: 'Project submission extended - faculty approved a 2-day extension for the final semester project report.',
        category: 'School / College'
    },
    {
        text: 'Internal examination timetable - internals begin next Monday, check your syllabus and exam schedule.',
        category: 'School / College'
    },
    {
        text: 'College registration reminder - complete your semester enrollment and fee payment by Friday.',
        category: 'School / College'
    },
    {
        text: 'Assignment submission feedback from your faculty - revisions needed before the final semester submission.',
        category: 'School / College'
    },

    // ==================== SPAM (phrase-pattern weighted keywords) ====================
    {
        text: 'Congratulations! You have won a lottery jackpot. Claim your prize now before it expires.',
        category: 'Spam'
    },
    {
        text: 'Earn free money instantly with our guaranteed income plan. No investment needed, click now to start.',
        category: 'Spam'
    },
    {
        text: 'Click now to claim your crypto investment reward. Earn instantly and double your money in 24 hours.',
        category: 'Spam'
    },
    {
        text: 'You have been selected as our jackpot winner. Claim prize now and receive free money directly in your account.',
        category: 'Spam'
    },
    {
        text: 'Guaranteed income from home - earn instantly with our secret crypto investment strategy. Click now!',
        category: 'Spam'
    },
    {
        text: 'Lottery winner announcement - you have won $1,000,000. Claim your free money prize by clicking now.',
        category: 'Spam'
    },
    {
        text: 'Make money fast with our guaranteed income system. Click now and start earning instantly today.',
        category: 'Spam'
    },
    {
        text: 'Your crypto investment has multiplied! Claim prize and withdraw your guaranteed income now.',
        category: 'Spam'
    },
    {
        text: 'Free money alert - jackpot winner selected. Do not miss your chance, claim prize instantly.',
        category: 'Spam'
    },
    {
        text: 'Earn instantly by joining our lottery network. Guaranteed income every week, click now to register free.',
        category: 'Spam'
    },

    // ==================== PROMOTIONAL (phrase-pattern weighted keywords) ====================
    {
        text: 'Get 50% discount on all orders today - use exclusive coupon code SAVE50 and shop now!',
        category: 'Uncategorized'
    },
    {
        text: 'Shop now and get instant cashback - this limited-time offer ends tonight at midnight.',
        category: 'Uncategorized'
    },
    {
        text: 'Exclusive offer just for you - apply coupon code at checkout and save big. Offer ends Sunday.',
        category: 'Uncategorized'
    },
    {
        text: 'Cashback on every purchase this weekend - use discount code and shop now before the sale ends.',
        category: 'Uncategorized'
    },
    {
        text: 'Limited-time offer - flat 40% cashback on electronics. Shop now and grab your coupon today.',
        category: 'Uncategorized'
    },
    {
        text: 'Sale ending soon - grab your coupon before the offer ends. Discount up to 70% on selected brands.',
        category: 'Uncategorized'
    },
    {
        text: 'Exclusive discount for members - shop now and earn cashback. Limited-time offer, coupon inside.',
        category: 'Uncategorized'
    },
    {
        text: 'Flash sale is live - 60% discount with cashback on first order. Use coupon and shop now.',
        category: 'Uncategorized'
    },
    {
        text: 'Special offer ends today - redeem your coupon for extra cashback when you shop now.',
        category: 'Uncategorized'
    },
    {
        text: 'Do not miss the limited-time offer - discount and cashback combined. Shop now before it expires.',
        category: 'Uncategorized'
    },

    // ==================== SOCIAL (phrase-pattern weighted keywords) ====================
    {
        text: 'Someone liked your post and commented on your latest photo. Check your notifications now.',
        category: 'Uncategorized'
    },
    {
        text: 'You have a new follow request from a mutual friend and a connection request pending on LinkedIn.',
        category: 'Uncategorized'
    },
    {
        text: 'You were mentioned in a post and tagged in a photo by one of your friends.',
        category: 'Uncategorized'
    },
    {
        text: 'New connection request received on LinkedIn. Someone also commented on your recent update.',
        category: 'Uncategorized'
    },
    {
        text: 'A friend tagged you in a photo. Check who liked your post and who sent a follow request.',
        category: 'Uncategorized'
    },
    {
        text: 'Your post was liked by 50 people. Someone also commented and mentioned you in their story.',
        category: 'Uncategorized'
    },
    {
        text: 'New follow request from someone you may know. They also liked and commented on your recent post.',
        category: 'Uncategorized'
    },
    {
        text: 'You were tagged in a group photo. 10 people liked your post and 3 commented on it.',
        category: 'Uncategorized'
    },
    {
        text: 'Connection request accepted - your mutual friend also commented and liked your profile update.',
        category: 'Uncategorized'
    },
    {
        text: 'Someone mentioned you in a comment and sent a follow request. Check your social notifications.',
        category: 'Uncategorized'
    },

    // ==================== IMPORTANT (phrase-pattern weighted keywords) ====================
    {
        text: 'Password reset required - this is an official notice. Complete account verification immediately.',
        category: 'Security'
    },
    {
        text: 'Security alert: action required for your account verification. Respond to this official notice immediately.',
        category: 'Security'
    },
    {
        text: 'Official notice: complete your account verification to avoid suspension. Action required within 24 hours.',
        category: 'Security'
    },
    {
        text: 'Action required: verify your account now. A password reset link has been sent to your registered email.',
        category: 'Security'
    },
    {
        text: 'Security alert: unauthorized access detected on your account. Action required - verify your identity now.',
        category: 'Security'
    },
    {
        text: 'Official notice: your account verification is pending. Password reset and action required before access is restored.',
        category: 'Security'
    },
    {
        text: 'Urgent security alert - multiple failed login attempts detected. Action required: reset your password now.',
        category: 'Security'
    },
    {
        text: 'Account verification required - official notice from our security team. Please take action immediately.',
        category: 'Security'
    },
    {
        text: 'Your password reset request is confirmed. If you did not make this request, take action immediately.',
        category: 'Security'
    },
    {
        text: 'Official notice: security alert on your account. Action required to complete verification and secure access.',
        category: 'Security'
    },

    // ==================== BUSINESS (additional phrase-pattern keywords) ====================
    {
        text: 'Invoice attached for client review - payment due by end of the month. Please process accordingly.',
        category: 'Business'
    },
    {
        text: 'Purchase order confirmed from client - procurement team please review the contract and approve.',
        category: 'Business'
    },
    {
        text: 'Client meeting scheduled to discuss the quotation and proposal documents attached herein.',
        category: 'Business'
    },
    {
        text: 'Payment invoice submitted for the procurement contract - partnership agreement is ready to sign.',
        category: 'Business'
    },
    {
        text: 'Business proposal and purchase order received from client - payment due next week for services.',
        category: 'Business'
    },
    {
        text: 'Quotation request from a prospective client - please prepare a proposal and submit by Friday.',
        category: 'Business'
    },
    {
        text: 'Procurement update - the purchase order has been dispatched, invoice and contract enclosed.',
        category: 'Business'
    },
    {
        text: 'Client onboarding invoice raised - procurement and payment due details sent separately.',
        category: 'Business'
    },

    // ==================== PERSONAL (additional phrase-pattern keywords) ====================
    {
        text: 'Happy birthday! Sending warm wishes on your special day. Hope this anniversary is memorable.',
        category: 'Personal'
    },
    {
        text: 'Family reunion invitation - congratulations to everyone, looking forward to meeting the whole family.',
        category: 'Personal'
    },
    {
        text: 'Wedding invitation for our dear friends - please join us in the celebration of their anniversary.',
        category: 'Personal'
    },
    {
        text: 'Congratulations on your achievement! We are so proud. The reunion party is next weekend.',
        category: 'Personal'
    },
    {
        text: 'Birthday party invitation for Sarah - friends and family are all invited to join the celebration.',
        category: 'Personal'
    },
    {
        text: 'Anniversary congratulations to the happy couple - the reunion is planned for next month.',
        category: 'Personal'
    },
    {
        text: 'Friend request accepted - congratulations, you are now connected. Looking forward to the reunion.',
        category: 'Personal'
    },
    {
        text: 'Wedding anniversary celebration - family invitation extended to all friends and close relatives.',
        category: 'Personal'
    }
];

// Sample initial email dataset across all 7 categories
const sampleEmails = [
    {
        userEmail: 'user@example.com',
        gmailId: 'seed-sec-01',
        from: 'Google Security Center <no-reply@accounts.google.com>',
        to: 'user@example.com',
        subject: '🚨 Critical Security Alert: New Sign-in Attempt from Windows Device',
        snippet: 'A new sign-in was detected on your account from Chrome on Windows in Singapore. If this was not you, secure your account.',
        text: 'Hi Sudeep,\n\nWe detected a new sign-in to your Google Account from a Windows device. If this was you, you do not need to do anything. If this was not you, we recommend securing your account immediately by resetting your password.',
        content: 'Hi Sudeep, We detected a new sign-in to your Google Account from a Windows device.',
        category: 'Security',
        confidence: 0.98,
        isRead: false,
        receivedAt: new Date(Date.now() - 1000 * 60 * 12),
        labels: ['INBOX'],
        reminders: [{ type: 'deadline', text: 'Secure account before today 11:59 PM' }],
    },
    {
        userEmail: 'user@example.com',
        gmailId: 'seed-fin-01',
        from: 'Chase Bank Alerts <notify@chase-banking.com>',
        to: 'user@example.com',
        subject: '💳 Transaction Alert: $450.00 Payment Processed Successfully',
        snippet: 'Your recent account payment of $450.00 to Cloud Hosting Services was processed. View your current balance and statement.',
        text: 'Dear Customer,\n\nYour payment of $450.00 was authorized on your card ending in 8832 for Cloud Hosting Services.\nAvailable Balance: $42,850.00.\n\nThank you for banking with Chase.',
        content: 'Your payment of $450.00 was authorized on your card ending in 8832.',
        category: 'Finance',
        confidence: 0.97,
        isRead: false,
        receivedAt: new Date(Date.now() - 1000 * 60 * 35),
        labels: ['INBOX'],
        reminders: [{ type: 'deadline', text: 'Review monthly statement' }],
    },
    {
        userEmail: 'user@example.com',
        gmailId: 'seed-biz-01',
        from: 'Alex Vance <alex.vance@enterprise-corp.com>',
        to: 'user@example.com',
        subject: '📄 Q3 Project Proposal & Client Contract Deliverable',
        snippet: 'Please find attached the updated project agreement and contract deliverables for client approval by tomorrow.',
        text: 'Hi Team,\n\nPlease review the attached Q3 project proposal and milestone deliverables before our sync meeting tomorrow at 10:00 AM.\n\nWarm regards,\nAlex Vance\nLead Project Manager',
        content: 'Please review the attached Q3 project proposal and milestone deliverables.',
        category: 'Business',
        confidence: 0.95,
        isRead: false,
        receivedAt: new Date(Date.now() - 1000 * 60 * 75),
        labels: ['INBOX'],
        reminders: [{ type: 'meeting', text: 'Sync meeting tomorrow at 10:00 AM' }],
    },
    {
        userEmail: 'user@example.com',
        gmailId: 'seed-per-01',
        from: 'Sarah Miller <sarah.m@gmail.com>',
        to: 'user@example.com',
        subject: '🎉 Birthday Party & Weekend Get-together Invitation!',
        snippet: 'Hey! We are hosting a birthday dinner and weekend reunion this Saturday at 7 PM. Would love for you to join us!',
        text: 'Hey there!\n\nWe are hosting a birthday dinner and weekend reunion this Saturday at 7 PM. Let me know if you can make it, hope you can celebrate with the family!\n\nBest,\nSarah',
        content: 'We are hosting a birthday dinner and weekend reunion this Saturday at 7 PM.',
        category: 'Personal',
        confidence: 0.94,
        isRead: true,
        receivedAt: new Date(Date.now() - 1000 * 60 * 180),
        labels: ['INBOX'],
        reminders: [{ type: 'meeting', text: 'Weekend reunion this Saturday at 7 PM' }],
    },
    {
        userEmail: 'user@example.com',
        gmailId: 'seed-sch-01',
        from: 'Prof. Anderson (Dean Office) <anderson@university.edu>',
        to: 'user@example.com',
        subject: '🎓 Fall Semester Exam Timetable & Course Registration Deadline',
        snippet: 'Final semester exam schedule has been published on the student portal. Submit your course assignment by Friday.',
        text: 'Dear Students,\n\nThe timetable for the final semester exam has been published. All homework assignments must be uploaded before Friday 5:00 PM.\n\nOffice of the Dean',
        content: 'All homework assignments must be uploaded before Friday 5:00 PM.',
        category: 'School / College',
        confidence: 0.96,
        isRead: false,
        receivedAt: new Date(Date.now() - 1000 * 60 * 320),
        labels: ['INBOX'],
        reminders: [{ type: 'deadline', text: 'Upload homework assignments before Friday 5:00 PM' }],
    },
    {
        userEmail: 'user@example.com',
        gmailId: 'seed-spm-01',
        from: 'Mega Jackpot Rewards <claim@instantprizewin.xyz>',
        to: 'user@example.com',
        subject: '🎁 CONGRATULATIONS! Claim your $50,000 lottery cash reward now!',
        snippet: 'YOU ARE A WINNER! You have won our guaranteed income lottery! Click here and act now to claim your cash reward prize!',
        text: 'YOU ARE A WINNER!\n\nYou have won our guaranteed cash lottery! Click here and act now to claim your prize before it expires!',
        content: 'You have won our guaranteed cash lottery! Click here and act now.',
        category: 'Spam',
        confidence: 0.99,
        isRead: false,
        receivedAt: new Date(Date.now() - 1000 * 60 * 500),
        labels: ['SPAM'],
        reminders: [],
    }
];

// Main seed function
const seed = async () => {
    console.log('🌱 Starting LiveMail Classifier seed...');

    try {
        // Connect to MongoDB
        await connectDB();
        console.log('✅ Database connected');

        // Initialize the classifier
        initializeClassifier();
        console.log('✅ Classifier initialized');

        // Normalize training data categories to standard 7 categories
        const normalizedTrainingData = trainingData.map(d => {
            let cat = d.category;
            if (cat === 'Business') cat = 'Primary';
            if (cat === 'School / College') cat = 'College / Student';
            if (cat === 'Uncategorized') cat = 'Other / Uncategorized';
            return { ...d, category: cat };
        });

        // Train with all the data
        trainClassifier(normalizedTrainingData);
        console.log('✅ Classifier trained with', normalizedTrainingData.length, 'samples');

        // Save the classifier
        await saveClassifier();
        console.log('✅ Classifier saved to disk');

        // Seed initial sample categorized emails into MongoDB Email collection if database is connected
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState === 1) {
            console.log('📥 Storing sample categorized emails in MongoDB...');
            for (const mail of sampleEmails) {
                let cat = mail.category;
                if (cat === 'Business') cat = 'Primary';
                if (cat === 'School / College') cat = 'College / Student';
                if (cat === 'Uncategorized') cat = 'Other / Uncategorized';

                const normalizedMail = {
                    ...mail,
                    category: cat,
                    gmailMessageId: mail.gmailId,
                    fromName: mail.from ? mail.from.split('<')[0].trim() : '',
                    fromAddress: mail.from && mail.from.includes('<') ? mail.from.split('<')[1].replace('>', '').trim() : mail.from,
                    bodyText: mail.text || mail.content || '',
                    recipient: mail.to || 'user@example.com'
                };

                await Email.findOneAndUpdate(
                    { userEmail: mail.userEmail, gmailId: mail.gmailId },
                    { $set: normalizedMail },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
            }
            console.log('✅ Sample emails stored in MongoDB Email collection');
        } else {
            console.log('ℹ️ MongoDB not connected: trained & saved Bayes Classifier to disk.');
        }

        // Print summary
        const categoryCount = {};
        normalizedTrainingData.forEach(d => {
            categoryCount[d.category] = (categoryCount[d.category] || 0) + 1;
        });

        console.log('\n📊 Training Data Summary:');
        Object.entries(categoryCount).forEach(([category, count]) => {
            console.log(`   ${category}: ${count} samples`);
        });

        console.log('\n🎉 Seed completed successfully!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Seed failed:', error);
        process.exit(1);
    }
};

// Run the seed
seed();