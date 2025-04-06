// notification.js
const { MongoClient, ObjectId } = require('mongodb');
const nodemailer = require('nodemailer'); // For email notifications
const axios = require('axios'); // For API calls to external systems

// MongoDB connection reusing your existing configuration
const uri = "mongodb+srv://AkshatDimri:X7G0tooefK1Xyo1y@postdata.1mc5t.mongodb.net/";
const client = new MongoClient(uri);
const dbName = "PostNLP_Data";
const collectionName = "analyzed_tweets";

// Department mapping collection
const departmentCollectionName = "departments";

// Collection to track notifications (to avoid duplicate alerts)
const notificationCollectionName = "sent_notifications";

// Set severity threshold
const SEVERITY_THRESHOLD = 30;

// Connect to MongoDB
async function connectToMongo() {
  try {
    await client.connect();
    console.log("Connected to MongoDB Atlas for notification service");
    
    // Initialize department collection if needed
    const db = client.db(dbName);
    await initializeDepartmentCollection(db);
    
    return db;
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    throw error;
  }
}

// Initialize the department collection with sample data if empty
async function initializeDepartmentCollection(db) {
  const collection = db.collection(departmentCollectionName);
  const count = await collection.countDocuments();
  
  if (count === 0) {
    // Sample department data - you would customize this
    const departments = [
      {
        name: "Roads & Infrastructure",
        keywords: ["road", "pothole", "street", "bridge", "highway", "footpath", "sidewalk"],
        email: "ee-ham-hp@nic.in",  // PWD Hamirpur
        api_endpoint: "https://pwd.hp.gov.in/api/hamirpur/roads",  // Not publicly available; assumed structure
        api_key: "hamirpur_pwd_key"
      },
      {
        name: "Water Supply",
        keywords: ["water", "pipe", "leak", "flooding", "sewage", "drain"],
        email: "eeiph-ham-hp@nic.in",  // Jal Shakti Vibhag
        api_endpoint: "https://iph.hp.gov.in/api/hamirpur/water",  // Not publicly available; assumed structure
        api_key: "hamirpur_water_key"
      },
      {
        name: "Electricity",
        keywords: ["power", "outage", "electricity", "transformer", "electric", "blackout"],
        email: "eeopcircle.hamirpur@hpseb.in",  // HPSEB Hamirpur
        api_endpoint: "https://hpseb.in/api/hamirpur/electricity",  // Not publicly available; assumed structure
        api_key: "hamirpur_electricity_key"
      },
      {
        name: "Sanitation",
        keywords: ["garbage", "trash", "waste", "dump", "clean", "rubbish", "litter"],
        email: "eohamirpur@gmail.com",  // Municipal Council Hamirpur
        api_endpoint: "https://mc.hamirpurhp.gov.in/api/sanitation",  // Assumed
        api_key: "hamirpur_sanitation_key"
      },
      {
        name: "Public Grievances",
        keywords: ["safety", "danger", "accident", "hazard", "crime", "police", "emergency"],
        email: "dc-ham-hp@nic.in",  // DC Office Hamirpur
        api_endpoint: "https://hp.gov.in/api/hamirpur/publicgrievance",  // Assumed fallback
        api_key: "hamirpur_grievance_key"
      }
    ];
    
    await collection.insertMany(departments);
    console.log("Department collection initialized with sample data");
  }
}

// Checking for issues that crossed the threshold and need notification
async function checkHighSeverityIssues() {
  try {
    const db = await connectToMongo();
    const issuesCollection = db.collection(collectionName);
    const notificationsCollection = db.collection(notificationCollectionName);
    
    // Finding all issues that exceed the severity threshold
    // Calculating effective severity (original + upvotes - downvotes)
    const highSeverityIssues = await issuesCollection.find({}).toArray();
    
    for (const issue of highSeverityIssues) {
      const upvotes = issue.upvotes || 0;
      const downvotes = issue.downvotes || 0;
      const effectiveSeverity = issue.severity_score + upvotes - downvotes;
      
      // Checking if the issue crosses the threshold
      if (effectiveSeverity >= SEVERITY_THRESHOLD) {
        // Checking if we've already sent a notification for this issue
        const notificationExists = await notificationsCollection.findOne({
          issue_id: issue._id.toString()
        });
        
        // If no notification has been sent, process the issue
        if (!notificationExists) {
          console.log(`High severity issue detected: ${issue._id} (Score: ${effectiveSeverity})`);
          
          // Identifying the relevant department
          const department = await identifyDepartment(db, issue);
          
          // Sending the notification
          await sendNotification(db, issue, department, effectiveSeverity);
          
          // Logging the notification in the database
          await notificationsCollection.insertOne({
            issue_id: issue._id.toString(),
            tweet_id: issue.id_str,
            severity: effectiveSeverity,
            department: department ? department.name : "Unclassified",
            sent_at: new Date(),
            tweet_text: issue.text
          });
        }
      }
    }
    
    console.log("Completed checking for high severity issues");
  } catch (error) {
    console.error("Error checking high severity issues:", error);
  } finally {
    // Don't close the client if it's being used elsewhere in the application
  }
}

// Identifying the appropriate department for the issue
async function identifyDepartment(db, issue) {
  try {
    const departmentsCollection = db.collection(departmentCollectionName);
    const departments = await departmentsCollection.find({}).toArray();
    
    // First, to check if a department is explicitly mentioned in the tweet
    const tweetText = issue.text.toLowerCase();
    
    for (const department of departments) {
      // Checking for direct department mentions
      if (tweetText.includes(department.name.toLowerCase())) {
        return department;
      }
      
      // Checking for keywords associated with each department
      for (const keyword of department.keywords) {
        if (tweetText.includes(keyword.toLowerCase())) {
          return department;
        }
      }
    }
    
    // If no direct match, using a basic scoring system based on keyword frequency
    let bestMatch = null;
    let highestScore = 0;
    
    for (const department of departments) {
      let score = 0;
      
      for (const keyword of department.keywords) {
        // Counting occurrences of the keyword in the text
        const regex = new RegExp(keyword, 'gi');
        const matches = tweetText.match(regex);
        
        if (matches) {
          score += matches.length;
        }
      }
      
      if (score > highestScore) {
        highestScore = score;
        bestMatch = department;
      }
    }
    
    // Return the best match, or null if no match found
    return bestMatch;
  } catch (error) {
    console.error("Error identifying department:", error);
    return null;
  }
}

// Sending notification to the appropriate department
async function sendNotification(db, issue, department, effectiveSeverity) {
  try {
    // Creating the notification content
    const notificationContent = {
      issue_id: issue._id.toString(),
      tweet_id: issue.id_str,
      tweet_text: issue.text,
      severity_score: effectiveSeverity,
      timestamp: new Date(),
      location: issue.location || "Location unknown",
      upvotes: issue.upvotes || 0,
      downvotes: issue.downvotes || 0
    };
    
    // If a department was identified, send to that department
    if (department) {
      console.log(`Notifying ${department.name} about issue ${issue._id}`);
      
      // Send via email if email is configured
      if (department.email) {
        await sendEmailNotification(department.email, notificationContent);
      }
      
      // Send via API if endpoint is configured
      if (department.api_endpoint) {
        await sendApiNotification(department.api_endpoint, department.api_key, notificationContent);
      }
    } else {
      // Send to a default department or administrator if no specific department found
      console.log(`No specific department identified for issue ${issue._id}, sending to admin`);
      await sendEmailNotification("admin@example.gov", notificationContent);
    }
    
    // Update the issue to mark it as escalated
    const issuesCollection = db.collection(collectionName);
    await issuesCollection.updateOne(
      { _id: issue._id },
      { $set: { escalated: true, escalated_at: new Date() } }
    );
    
    console.log(`Issue ${issue._id} marked as escalated`);
  } catch (error) {
    console.error("Error sending notification:", error);
  }
}

// Send email notification
async function sendEmailNotification(emailAddress, content) {
  const transporter = nodemailer.createTransport({
    host: 'live.smtp.mailtrap.io',
    port: 587,
    secure: false,
    auth: {
      user: 'api',
      pass: 'd3cbf1e32bc72f4ebb706ada38f24059'
    }
  });

  await transporter.sendMail({
    from: '"Civic Dashboard" <noreply@hamirpur.gov.in>',
    to: emailAddress,
    subject: "New Complaint Notification",
    text: content,
    html: `<p>${content}</p>`
  });
}
  
  const mailOptions = {
    from: 'Civic Issues Alert <notifications@civic-issues.org>',
    to: emailAddress,
    subject: `HIGH SEVERITY CIVIC ISSUE (Score: ${content.severity_score})`,
    html: `
      <h2>High Severity Civic Issue Alert</h2>
      <p><strong>Issue ID:</strong> ${content.issue_id}</p>
      <p><strong>Severity Score:</strong> ${content.severity_score}</p>
      <p><strong>Reported:</strong> ${content.timestamp}</p>
      <p><strong>Issue Details:</strong> ${content.tweet_text}</p>
      <p><strong>Location:</strong> ${JSON.stringify(content.location)}</p>
      <p><strong>Community Response:</strong> ${content.upvotes} upvotes, ${content.downvotes} downvotes</p>
      <p>Please address this issue according to your department's protocol.</p>
    `
  };
  
  try {
    console.log(`Sending email notification to ${emailAddress}`);
    // In development, just log instead of actually sending
    // await transporter.sendMail(mailOptions);
    console.log('Email notification content:', mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }

// Send API notification to department endpoint
async function sendApiNotification(endpoint, apiKey, content) {
  try {
    console.log(`Sending API notification to ${endpoint}`);
    /*
    const response = await axios.post(endpoint, content, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    });
    console.log('API notification response:', response.data);
    */
    console.log('API notification content:', content);
    return true;
  } catch (error) {
    console.error('Error sending API notification:', error);
    return false;
  }
}

// Export the functions for use in server.js
module.exports = {
  checkHighSeverityIssues,
  SEVERITY_THRESHOLD
};