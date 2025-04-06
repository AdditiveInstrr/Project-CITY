# Project-CITY

# Twitter Civic Complaints Monitoring System

## Overview
This project monitors civic complaints posted on Twitter with the hashtag #CITYHamirpur, analyzes the sentiment and content of these complaints, and stores the results in a MongoDB database. The system includes tweet collection, natural language processing, sentiment analysis, issue categorization, troll detection, a backend server for API access and notifications, and an admin portal for issue management. Additionally, the system incorporates blockchain integration for transparent, immutable record-keeping of complaints.

## Components

### 1. initial_fetch.py
Responsible for collecting tweets from Twitter's API:
- Connects to Twitter API v2 using a bearer token
- Searches for tweets containing the #CITYHamirpur hashtag (excluding retweets)
- Stores tweet data in a MongoDB collection
- Handles rate limiting for continuous operation

### 2. NLProcessing.py
Performs advanced analysis on the collected tweets:
- Sentiment analysis using VADER
- Issue categorization (Water, Electricity, Roads, etc.)
- Severity scoring based on sentiment and engagement
- GPU-accelerated processing with PyTorch
- BERT-based classification (when sufficient training data is available)
- Troll detection using regex pattern matching

### 3. server.js
Provides REST API endpoints and notification handling:
- Express.js server for API access
- Geospatial querying for location-based issue reporting
- Department mapping and notification routing
- Automatic email and API notifications for high-severity issues
- Upvote/downvote functionality with location validation
- Periodic severity checks with configurable thresholds
- Admin portal API endpoints for issue management

### 4. notification.js
Handles automated alerts for high-severity civic issues:
- Monitors complaints that exceed configurable severity thresholds
- Smart department routing based on complaint content analysis
- Multi-channel notifications via email and department API endpoints
- Prevents duplicate alerts with notification tracking
- Dynamically calculates effective severity based on community feedback (upvotes/downvotes)
- Marks escalated issues in the database for tracking

### 5. Admin Portal
Provides administrative interface for issue management:
- Displays all complaints with filtering capabilities
- Threshold-based issue monitoring (auto-identifies issues with 3+ upvotes)
- Manual issue forwarding to appropriate departments
- Department routing based on issue categorization
- Email notification system for department officials
- Status tracking for forwarded vs. pending issues
- User-friendly interface for administrative oversight

### 6. blockchain_sync.py
Handles synchronization of complaint data to the blockchain:
- Records important complaint data immutably on Ethereum blockchain
- Ensures transparent and tamper-proof record-keeping
- Creates permanent public records of civic issues
- Syncs high-priority or resolved complaints to the blockchain

## Setup Instructions

### Prerequisites
- Python 3.6 or higher
- Node.js 14.x or higher
- CUDA-capable GPU (optional, for faster processing)
- MongoDB Atlas account (or local MongoDB installation)
- Twitter Developer account with API access
- Ethereum wallet with private key
- Access to an Ethereum node or service (like Infura)

### Step 1: Install Required Dependencies
bash
# Create and activate a virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install required packages for initial_fetch.py
pip install tweepy pymongo

# Install required packages for NLProcessing.py
pip install torch numpy pandas nltk scikit-learn transformers re
pip install -U nltk

# Install required packages for blockchain integration
pip install web3

# Install Node.js dependencies for server.js and notification.js
cd backend
npm install express mongodb cors nodemailer body-parser path

# Install Blockchain Dependencies
npm install web3 @truffle/contract @openzeppelin/contracts


### Step 2: Download NLTK Resources
python
# Run this in a Python interpreter
import nltk
nltk.download('vader_lexicon')


### Step 3: Configure Twitter API Access
1. Replace the placeholder bearer token in initial_fetch.py with your own Twitter API bearer token:
   python
   bearer_token = "YOUR_TWITTER_BEARER_TOKEN"
   
   
   > ⚠ *Security Note*: In production, it's strongly recommended to use environment variables or a secure configuration file instead of hardcoding credentials.

### Step 4: Configure MongoDB Connection
1. Replace the MongoDB connection URI in both Python scripts and JavaScript files with your own:
   python
   # In Python scripts
   mongo_uri = "YOUR_MONGODB_CONNECTION_STRING"
   
   javascript
   // In server.js and notification.js
   const uri = "YOUR_MONGODB_CONNECTION_STRING";
   

2. Make sure your MongoDB instance has the following databases and collections:
   - Database: civic_complaints
     - Collection: tweets
   - Database: PostNLP_Data
     - Collection: analyzed_tweets
     - Collection: troll_tweets
     - Collection: departments
     - Collection: sent_notifications

### Step 5: Configure Email Notifications
1. Update the SMTP settings in both server.js and notification.js for email notifications:
   javascript
   const transporter = nodemailer.createTransport({
     host: 'YOUR_SMTP_HOST',
     port: 587,
     secure: false,
     auth: {
       user: 'YOUR_USERNAME',
       pass: 'YOUR_PASSWORD'
     }
   });
   

### Step 6: Configure Blockchain Integration
1. Install Truffle globally and initialize it in the blockchain directory:
   bash
   npm install -g truffle
   cd blockchain
   truffle init
   

2. Create a .env file in the project root and add your blockchain configuration:
   
   WEB3_PROVIDER_URL=your_ethereum_node_url
   WALLET_PRIVATE_KEY=your_ethereum_wallet_private_key
   CONTRACT_ADDRESS=your_deployed_contract_address
   

3. Deploy the smart contract to your network of choice:
   bash
   truffle migrate --network <network_name>
   

4. Update the blockchain/config.js file with your contract details:
   javascript
   module.exports = {
     CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS,
     WEB3_PROVIDER_URL: process.env.WEB3_PROVIDER_URL
   }
   

### Step 7: Run the Scripts
Run the tweet collection script:
bash
python initial_fetch.py


In a separate terminal session, run the analysis script:
bash
python NLProcessing.py


Start the blockchain synchronization:
bash
python blockchain_sync.py


Start the backend server and admin portal:
bash
node server.js


Access the admin portal at http://localhost:5000

## System Architecture

### Data Flow
1. initial_fetch.py collects tweets and stores them in civic_complaints.tweets
2. NLProcessing.py processes unanalyzed tweets from civic_complaints.tweets
3. Analysis results are stored in PostNLP_Data.analyzed_tweets
4. Tweets identified as trolls are additionally stored in PostNLP_Data.troll_tweets
5. server.js provides API endpoints for accessing and interacting with the data
6. Admin portal retrieves issues that meet forwarding criteria
7. notification.js monitors for high-severity issues and alerts relevant departments
8. Notification history is stored in PostNLP_Data.sent_notifications
9. blockchain_sync.py synchronizes important complaints to the Ethereum blockchain for permanent, immutable record-keeping

### Key Features

#### Admin Portal
- View all complaints with severity scores and department assignments
- Automated issue threshold detection (3+ upvotes)
- Manual forwarding system for prioritized issues
- Department email notification system
- Issue status tracking (Pending/Forwarded)
- Integration with severity scoring system

#### Intelligent Notification System
- Configurable severity threshold (default: 30)
- Dynamically adjusts severity based on community feedback
- Intelligent department matching using keyword analysis
- Multi-channel alerts (email and API)
- Prevents duplicate notifications for the same issue

#### Sentiment Analysis
- Uses VADER for sentiment scoring (-1 to 1 scale)
- Compound score represents overall sentiment
- Provides positive, negative, and neutral component scores

#### Department Mapping
- Automatic categorization of issues by department:
  - Jal Shakti Vibhag (Water)
  - Public Works Department (Roads)
  - HP State Electricity Board (Electricity)
  - Municipal Council (Garbage/Sanitation)
  - Deputy Commissioner's Office (Other/General)

#### Blockchain Integration
- Transparent, immutable record-keeping of complaints
- Stores complaint ID, timestamp, severity, category, and status
- Provides public verification of complaint handling
- Smart contract implementation for automated record management
- Enables future DAO governance for community-led issue prioritization

## API Endpoints
- GET /api/all-issues - Get all issues with department info
- GET /api/threshold-issues - Get issues with 3+ upvotes not yet forwarded
- POST /api/forward-issue/:id - Forward issue to relevant department
- GET / - Serve the admin portal frontend

## Security Considerations
The current implementation contains hardcoded credentials, which is *not recommended for production environments*. Consider implementing:

1. Environment variables
2. Configuration files (excluded from version control)
3. Secret management services

## Future Prospects
- Advanced NLP models (BERT-based) for better classification
- Additional complaint sources such as WhatsApp & Telegram
- Multilingual support for wider accessibility
- DAO governance for community-led issue prioritization

## License
[Add your license information here]
