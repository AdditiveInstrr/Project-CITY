// server.js
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer'); // For email notifications
const axios = require('axios'); // For API calls to external systems

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB connection string
const uri = "mongodb+srv://AkshatDimri:X7G0tooefK1Xyo1y@postdata.1mc5t.mongodb.net/";
const client = new MongoClient(uri);
const dbName = "PostNLP_Data";
const collectionName = "analyzed_tweets";

// Department mapping collection
const departmentCollectionName = "departments";

// Collection to track notifications
const notificationCollectionName = "sent_notifications";

// Set severity threshold
const SEVERITY_THRESHOLD = 30;

// Connect to MongoDB
async function connectToMongo() {
  try {
    await client.connect();
    console.log("Connected to MongoDB Atlas");
    
    // Create a 2dsphere index for geospatial queries if it doesn't exist
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    
    // List existing indexes and check if our geospatial index exists
    const indexes = await collection.indexes();
    const geoIndexExists = indexes.some(index => 
      index.key && index.key["location.coordinates"] === "2dsphere"
    );
    
    if (!geoIndexExists) {
      await collection.createIndex({ "location.coordinates": "2dsphere" });
      console.log("Created geospatial index for location data");
    }
    
    // Initialize department collection if needed
    await initializeDepartmentCollection(db);
    
    return db;
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
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
        email: "ee-ham-hp@nic.in",
        api_endpoint: "https://hppwd.hp.gov.in",
        api_key: ""
      },
      {
        name: "Water Supply",
        keywords: ["water", "pipe", "leak", "flooding", "sewage", "drain"],
        email: "drdaham-hp@nic.in",
        api_endpoint: "https://city-api.example.gov/water/reports",
        api_key: ""
      },
      {
        name: "Electricity",
        keywords: ["power", "outage", "electricity", "transformer", "electric", "blackout"],
        email: "ceip@hpseb.in",
        api_endpoint: "https://city-api.example.gov/power/reports",
        api_key: ""
      },
      {
        name: "Sanitation",
        keywords: ["garbage", "trash", "waste", "dump", "clean", "rubbish", "litter"],
        email: "ud-hp@nic.in",
        api_endpoint: "https://city-api.example.gov/sanitation/reports",
        api_key: ""
      },
      {
        name: "Public Safety",
        keywords: ["safety", "danger", "accident", "hazard", "crime", "police", "emergency"],
        email: "safety@example.gov",
        api_endpoint: "https://city-api.example.gov/safety/reports",
        api_key: ""
      }
    ];
    
    await collection.insertMany(departments);
    console.log("Department collection initialized with sample data");
  }
}

// Check for issues that crossed the threshold and need notification
async function checkHighSeverityIssues() {
  try {
    const db = client.db(dbName);
    const issuesCollection = db.collection(collectionName);
    const notificationsCollection = db.collection(notificationCollectionName);
    
    // Find all issues that exceed the severity threshold
    // Calculate effective severity (original + upvotes - downvotes)
    const highSeverityIssues = await issuesCollection.find({}).toArray();
    
    for (const issue of highSeverityIssues) {
      const upvotes = issue.upvotes || 0;
      const downvotes = issue.downvotes || 0;
      const effectiveSeverity = issue.severity_score + upvotes - downvotes;
      
      // Check if the issue crosses the threshold
      if (effectiveSeverity >= SEVERITY_THRESHOLD) {
        // Check if we've already sent a notification for this issue
        const notificationExists = await notificationsCollection.findOne({
          issue_id: issue._id.toString()
        });
        
        // If no notification has been sent, process the issue
        if (!notificationExists) {
          console.log(`High severity issue detected: ${issue._id} (Score: ${effectiveSeverity})`);
          
          // Identify the relevant department
          const department = await identifyDepartment(db, issue);
          
          // Send the notification
          await sendNotification(db, issue, department, effectiveSeverity);
          
          // Log the notification in the database
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
  }
}

// Identify the appropriate department for the issue
async function identifyDepartment(db, issue) {
  try {
    const departmentsCollection = db.collection(departmentCollectionName);
    const departments = await departmentsCollection.find({}).toArray();
    
    // First, check if a department is explicitly mentioned in the tweet
    const tweetText = issue.text.toLowerCase();
    
    for (const department of departments) {
      // Check for direct department mentions
      if (tweetText.includes(department.name.toLowerCase())) {
        return department;
      }
      
      // Check for keywords associated with each department
      for (const keyword of department.keywords) {
        if (tweetText.includes(keyword.toLowerCase())) {
          return department;
        }
      }
    }
    
    // If no direct match, use a basic scoring system based on keyword frequency
    let bestMatch = null;
    let highestScore = 0;
    
    for (const department of departments) {
      let score = 0;
      
      for (const keyword of department.keywords) {
        // Count occurrences of the keyword in the text
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

// Send notification to the appropriate department
async function sendNotification(db, issue, department, effectiveSeverity) {
  try {
    // Create the notification content
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
  // For production, use actual SMTP configuration
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'your-notification-email@gmail.com',
      pass: 'your-email-password'
    }
  });
  
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
}

// Send API notification to department endpoint
async function sendApiNotification(endpoint, apiKey, content) {
  try {
    console.log(`Sending API notification to ${endpoint}`);
    // In development, just log instead of actually sending
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

// Get all issues sorted by severity score
app.get('/api/issues', async (req, res) => {
  try {
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    
    const issues = await collection.find({}).toArray();
    
    // Calculate effective severity score (original + upvotes - downvotes)
    const issuesWithEffectiveScore = issues.map(issue => {
      const upvotes = issue.upvotes || 0;
      const downvotes = issue.downvotes || 0;
      const effectiveSeverity = issue.severity_score + upvotes - downvotes;
      
      return {
        ...issue,
        effective_severity: effectiveSeverity
      };
    });
    
    // Sort by effective severity score
    issuesWithEffectiveScore.sort((a, b) => b.effective_severity - a.effective_severity);
    
    res.json(issuesWithEffectiveScore);
  } catch (error) {
    console.error("Error fetching issues:", error);
    res.status(500).json({ error: "Failed to fetch issues" });
  }
});

// Get issues with location data for map view
app.get('/api/issues/map', async (req, res) => {
  try {
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    
    // Find all issues that have location data
    const issues = await collection.find({
      "location.coordinates": { $exists: true }
    }).toArray();
    
    // Calculate effective severity score
    const issuesWithEffectiveScore = issues.map(issue => {
      const upvotes = issue.upvotes || 0;
      const downvotes = issue.downvotes || 0;
      const effectiveSeverity = issue.severity_score + upvotes - downvotes;
      
      return {
        ...issue,
        effective_severity: effectiveSeverity
      };
    });
    
    // Sort by effective severity score
    issuesWithEffectiveScore.sort((a, b) => b.effective_severity - a.effective_severity);
    
    res.json(issuesWithEffectiveScore);
  } catch (error) {
    console.error("Error fetching map data:", error);
    res.status(500).json({ error: "Failed to fetch map data" });
  }
});

// Update vote count (upvote or downvote) with location data
app.post('/api/issues/:id/vote', async (req, res) => {
  try {
    const { id } = req.params;
    const { voteType, location } = req.body; // 'upvote' or 'downvote' and location data
    
    // Validate vote type
    if (voteType !== 'upvote' && voteType !== 'downvote') {
      return res.status(400).json({ error: "Invalid vote type" });
    }
    
    // Validate location data
    if (!location || !location.coordinates || location.coordinates.length !== 2 ||
        typeof location.coordinates[0] !== 'number' || typeof location.coordinates[1] !== 'number') {
      return res.status(400).json({ error: "Valid location coordinates are required" });
    }
    
    const [lng, lat] = location.coordinates;
    
    // Basic validation for coordinates
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      return res.status(400).json({ error: "Invalid coordinates" });
    }
    
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    
    const issue = await collection.findOne({ _id: new ObjectId(id) });
    
    if (!issue) {
      return res.status(404).json({ error: "Issue not found" });
    }
    
    // Initialize vote counts if they don't exist
    const upvotes = issue.upvotes || 0;
    const downvotes = issue.downvotes || 0;
    
    // If the issue has a location, check if the user is in proximity (optional)
    if (issue.location && issue.location.coordinates && issue.location.coordinates.length === 2) {
      const [issueLng, issueLat] = issue.location.coordinates;
      
      // Validate that issue coordinates are numeric
      if (typeof issueLng === 'number' && typeof issueLat === 'number') {
        // Calculate distance between issue and user (in kilometers)
        const distance = calculateDistance(lat, lng, issueLat, issueLng);
        
        // Optional: Only allow votes from users within a certain radius (e.g., 10km)
        const MAX_DISTANCE_KM = 10;
        if (distance > MAX_DISTANCE_KM) {
          return res.status(400).json({
            error: `You are too far from this issue location (${distance.toFixed(1)}km away). Must be within ${MAX_DISTANCE_KM}km to vote.`
          });
        }
      }
    }
    
    // Prepare update operations
    const updateOps = {};
    
    // Update the vote count
    const newUpvotes = voteType === 'upvote' ? upvotes + 1 : upvotes;
    const newDownvotes = voteType === 'downvote' ? downvotes + 1 : downvotes;
    
    updateOps.$set = {
      upvotes: newUpvotes,
      downvotes: newDownvotes
    };
    
    // Ensure the location is properly formatted as GeoJSON
    const locationGeoJSON = {
      type: "Point",
      coordinates: [lng, lat]
    };
    
    // Store the vote location in an array
    const voteLocationData = {
      voteType: voteType,
      location: locationGeoJSON,
      timestamp: new Date()
    };
    
    // Initialize vote_locations array if it doesn't exist or isn't an array
    if (!issue.vote_locations || !Array.isArray(issue.vote_locations)) {
      updateOps.$set.vote_locations = [voteLocationData];
    } else {
      updateOps.$push = { vote_locations: voteLocationData };
    }
    
    // If the issue doesn't have a location yet, use this vote's location
    if (!issue.location || !issue.location.coordinates) {
      updateOps.$set.location = locationGeoJSON;
    }
    
    // Update the document
    await collection.updateOne(
      { _id: new ObjectId(id) },
      updateOps
    );
    
    // Calculate effective severity after the vote
    const updatedEffectiveSeverity = issue.severity_score + newUpvotes - newDownvotes;
    
    // Check if this vote pushed the issue over the threshold
    if (updatedEffectiveSeverity >= SEVERITY_THRESHOLD) {
      // Trigger a severity check for this issue
      await checkHighSeverityIssues();
    }
    
    // Return the updated vote counts
    res.json({ 
      success: true,
      upvotes: newUpvotes,
      downvotes: newDownvotes,
      _id: id
    });
  } catch (error) {
    console.error("Error updating vote:", error);
    res.status(500).json({ error: "Failed to update vote" });
  }
});

// Helper function to calculate the distance between two points in kilometers
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const distance = R * c; // Distance in kilometers
  
  return distance;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

// New API endpoint to manually trigger checks
app.post('/api/check-high-severity', async (req, res) => {
  try {
    await checkHighSeverityIssues();
    res.json({ success: true, message: "High severity issue check completed" });
  } catch (error) {
    console.error("Error in manual severity check:", error);
    res.status(500).json({ error: "Failed to check high severity issues" });
  }
});

// API endpoint to get notification history
app.get('/api/notifications', async (req, res) => {
  try {
    const db = client.db(dbName);
    const collection = db.collection(notificationCollectionName);
    
    const notifications = await collection.find({}).sort({ sent_at: -1 }).toArray();
    res.json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// Start server
app.listen(PORT, async () => {
  await connectToMongo();
  console.log(`Server running on port ${PORT}`);
  
  // Run initial check for high severity issues
  await checkHighSeverityIssues();
  
  // Set up periodic data refresh and severity checks
  setInterval(async () => {
    console.log("Refreshing data from MongoDB and checking for high severity issues...");
    await checkHighSeverityIssues();
  }, 10 * 60 * 1000); // 10 minutes in milliseconds
});

// Enhance blockchain records retrieval with additional metrics
app.get('/api/blockchain-records', async (req, args) => {
  try {
    const db = client.db(dbName);
    const blockchainCollection = db.collection(blockchainCollectionName);
    const issuesCollection = db.collection(collectionName);
    
    // Fetch blockchain records sorted by timestamp
    const blockchainRecords = await blockchainCollection.find({}).sort({ registeredAt: -1 }).toArray();
    
    // Enrich blockchain records with additional metrics from analyzed_tweets
    const enrichedRecords = await Promise.all(blockchainRecords.map(async (record) => {
      // Find the corresponding issue
      const issue = await issuesCollection.findOne({ _id: new ObjectId(record.issueId) });
      
      if (!issue) {
        return {
          ...record,
          issueNotFound: true
        };
      }
      
      // Calculate additional metrics
      const upvotes = issue.upvotes || 0;
      const downvotes = issue.downvotes || 0;
      const effectiveSeverity = issue.severity_score + upvotes - downvotes;
      
      // Prepare geospatial data if available
      const locationData = issue.location ? {
        coordinates: issue.location.coordinates,
        type: issue.location.type
      } : null;
      
      // Compute additional blockchain-related metrics
      const blockchainMetrics = {
        registrationTimestamp: record.registeredAt,
        isVerified: record.verified || false,
        effectiveSeverity: effectiveSeverity,
        communityEngagement: {
          upvotes: upvotes,
          downvotes: downvotes,
          totalVotes: upvotes + downvotes
        }
      };
      
      return {
        ...record,
        issueDetails: {
          text: issue.text,
          category: issue.category || 'Uncategorized',
          source: issue.source || 'Unknown',
          language: issue.language || 'Unknown'
        },
        location: locationData,
        metrics: blockchainMetrics
      };
    }));
    
    // Optional: Add some aggregated statistics
    const aggregatedStats = {
      totalRecords: enrichedRecords.length,
      verifiedRecords: enrichedRecords.filter(record => record.metrics?.isVerified).length,
      averageSeverity: calculateAverageSeverity(enrichedRecords)
    };
    
    res.json({
      records: enrichedRecords,
      stats: aggregatedStats
    });
  } catch (error) {
    console.error("Error fetching blockchain records:", error);
    res.status(500).json({ error: "Failed to fetch blockchain records" });
  }
});

// Helper function to calculate average severity
function calculateAverageSeverity(records) {
  const validRecords = records.filter(record => 
    record.metrics && record.metrics.effectiveSeverity !== undefined
  );
  
  if (validRecords.length === 0) return 0;
  
  const totalSeverity = validRecords.reduce((sum, record) => 
    sum + record.metrics.effectiveSeverity, 0
  );
  
  return totalSeverity / validRecords.length;
}

// Optional: Function to add blockchain metadata when creating an issue
async function addBlockchainMetadata(issueId, additionalMetadata = {}) {
  try {
    const db = client.db(dbName);
    const issuesCollection = db.collection(collectionName);
    const blockchainCollection = db.collection(blockchainCollectionName);
    
    // Generate a sample blockchain hash (in real implementation, this would come from actual blockchain)
    const blockchainHash = generateBlockchainHash(issueId);
    
    // Add blockchain metadata to the issue
    await issuesCollection.updateOne(
      { _id: new ObjectId(issueId) },
      { 
        $set: { 
          blockchainMetadata: {
            hash: blockchainHash,
            registeredAt: new Date(),
            ...additionalMetadata
          }
        }
      }
    );
    
    // Create a blockchain record
    await blockchainCollection.insertOne({
      issueId: issueId.toString(),
      blockchainHash: blockchainHash,
      verified: false,
      registeredAt: new Date(),
      ...additionalMetadata
    });
    
    return blockchainHash;
  } catch (error) {
    console.error("Error adding blockchain metadata:", error);
    return null;
  }
}

// Utility function to generate a blockchain-like hash
function generateBlockchainHash(issueId) {
  const crypto = require('crypto');
  return crypto.createHash('sha256')
    .update(issueId + new Date().toISOString())
    .digest('hex');
}

