// server.js - Main backend file
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000; // port changes to 5000

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection string
const uri = "mongodb+srv://AkshatDimri:X7G0tooefK1Xyo1y@postdata.1mc5t.mongodb.net/";
const dbName = "PostNLP_Data";
const collectionName = "analyzed_tweets";

// Email configuration (SMTP Used - mailtrap.io)

const transporter = nodemailer.createTransport({
  host: 'live.smtp.mailtrap.io',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: 'api',
    pass: 'd3cbf1e32bc72f4ebb706ada38f24059'
  }
});

// Department mapping
const departments = [
  { 
    type: "Water",
    name: "Jal Shakti Vibhag, Hamirpur",
    email: "eeiph-ham-hp@nic.in" 
  },
  { 
    type: "Road",
    name: "Public Works Department, Hamirpur",
    email: "ee-ham-hp@nic.in" 
  },
  { 
    type: "Electricity", 
    name: "Himachal Pradesh State Electricity Board, Hamirpur",
    email: "eeopcircle.hamirpur@hpseb.in" 
  },
  { 
    type: "Garbage", 
    name: "Municipal Council Hamirpur",
    email: "eohamirpur@gmail.com" 
  },
  { 
    type: "Other", 
    name: "Deputy Commissioner's Office, Hamirpur",
    email: "dc-ham-hp@nic.in" 
  }
];

// NEW ROUTE: Get all complaints/issues
app.get('/api/all-issues', async (req, res) => {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const database = client.db(dbName);
    const collection = database.collection(collectionName);
    
    // Query all issues without any filter
    const issues = await collection.find({}).toArray();
    
    console.log(`Found ${issues.length} total issues`);
    
    // department info displayed onto the issues
    const enhancedIssues = issues.map(issue => {
      const issueType = issue.issue_category || "Other";
      const department = departments.find(d => d.type === issueType) || departments.find(d => d.type === "Other");
      
      return {
        ...issue,
        departmentToForward: department.name,
        departmentEmail: department.email,
        // Map fields to expected names for frontend
        severityScore: issue.severity_score,
        issueType: issue.issue_category,
        // Add status info based on whether the issue has been forwarded
        status: issue.forwardedToDepartment ? 'Forwarded' : 'Pending'
      };
    });
    
    res.json(enhancedIssues);
  } catch (error) {
    console.error("Error fetching all issues:", error);
    res.status(500).json({ error: "Failed to fetch issues" });
  } finally {
    await client.close();
  }
});

// Existing route to get issues that have reached the threshold
app.get('/api/threshold-issues', async (req, res) => {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const database = client.db(dbName);
    const collection = database.collection(collectionName);
    
    // Query issues that have reached upvote threshold but not yet forwarded
    const issues = await collection.find({
      upvotes: { $gte: 3 }, // Adjusted threshold to match server data
      forwardedToDepartment: { $exists: false } // This field will be added when forwarded
    }).toArray();
    
    console.log(`Found ${issues.length} issues above threshold`);
    
    // Enhance issues with department info
    const enhancedIssues = issues.map(issue => {
      const issueType = issue.issue_category || "Other";
      const department = departments.find(d => d.type === issueType) || departments.find(d => d.type === "Other");
      
      return {
        ...issue,
        departmentToForward: department.name,
        departmentEmail: department.email,
        // Map fields to expected names for frontend
        severityScore: issue.severity_score,
        issueType: issue.issue_category
      };
    });
    
    res.json(enhancedIssues);
  } catch (error) {
    console.error("Error fetching threshold issues:", error);
    res.status(500).json({ error: "Failed to fetch issues" });
  } finally {
    await client.close();
  }
});

// Route to forward an issue to department
app.post('/api/forward-issue/:id', async (req, res) => {
  const client = new MongoClient(uri);
  const issueId = req.params.id;
  
  try {
    await client.connect();
    const database = client.db(dbName);
    const collection = database.collection(collectionName);
    
    // Get the issue details
    const issue = await collection.findOne({ _id: new ObjectId(issueId) });
    
    if (!issue) {
      return res.status(404).json({ error: "Issue not found" });
    }
    
    // Determine department
    const issueType = issue.issue_category || "Other";
    const department = departments.find(d => d.type === issueType) || departments.find(d => d.type === "Other");
    
    // Send email to department
    const mailOptions = {
      from: 'Automated-mail-delivery-system',
      to: department.email,
      subject: `Civic Issue Requiring Attention: ${issue.text ? issue.text.substring(0, 50) : 'Unnamed Issue'}`,
      text: `
        Issue Details:
        --------------
        ID: ${issue._id}
        Description: ${issue.text || 'No description provided'}
        Location: ${issue.location ? JSON.stringify(issue.location) : 'Location not specified'}
        Severity Score: ${issue.severity_score || 'Not calculated'}
        Issue Category: ${issue.issue_category || 'Not classified'}
        Upvotes: ${issue.upvotes || 0}
        Tweet ID: ${issue.tweet_id}
        
        Please address this issue at your earliest convenience.
        
        This is an automated message from the Civic Issue Tracking System.
      `
    };

    // Update issue in database
    await collection.updateOne(
      { _id: new ObjectId(issueId) },
      { 
        $set: { 
          forwardedToDepartment: department.name,
          forwardedAt: new Date(),
          forwardedByAdmin: true
        } 
      }
    );
    
    res.json({ 
      success: true, 
      message: `Issue forwarded to ${department.name}`,
      department: department
    });
  } catch (error) {
    console.error("Error forwarding issue:", error);
    res.status(500).json({ error: "Failed to forward issue" });
  } finally {
    await client.close();
  }
});

// Serve the frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});