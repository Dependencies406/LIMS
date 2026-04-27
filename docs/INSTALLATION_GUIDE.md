# LIMS Application Installation Guide

This guide will help you install and deploy the LIMS application to your Firebase project.

## Prerequisites

Before starting, ensure you have:

- ✅ Node.js (v16 or higher) and npm installed
- ✅ Firebase CLI installed (`npm install -g firebase-tools`)
- ✅ A Firebase project set up (see `COMMERCIAL_DISTRIBUTION_SETUP.md`)
- ✅ Firebase credentials from your project

---

## Installation Steps

### Step 1: Extract Package

1. Extract the distribution package to a location of your choice
2. Open a terminal/command prompt in the extracted directory

### Step 2: Configure Firebase Credentials

#### Option A: Using the Python Setup Tool (Recommended)

1. **Navigate to the setup tool**:
   ```bash
   cd firebase-setup-tool
   ```

2. **Run the setup tool**:
   ```bash
   # Windows
   python main.py
   
   # Linux/Mac
   python3 main.py
   ```

3. **Enter your Firebase credentials**:
   - Fill in all required fields (marked with *)
   - Get these values from Firebase Console → Project Settings → Your apps
   - Click **"Test Connection"** to validate
   - Click **"Generate .env File"** to create the configuration

4. **Verify .env file created**:
   - Check that `.env` file exists in `lims-app/` directory

#### Option B: Manual Configuration

1. **Navigate to lims-app directory**:
   ```bash
   cd lims-app
   ```

2. **Create .env file**:
   - Copy `.env.example` to `.env`
   - Edit `.env` and fill in your Firebase credentials:

   ```env
   VITE_FIREBASE_API_KEY=your-api-key-here
   VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
   VITE_FIREBASE_APP_ID=your-app-id
   VITE_FIREBASE_MEASUREMENT_ID=your-measurement-id-optional
   ```

### Step 3: Install Dependencies

1. **Navigate to lims-app directory**:
   ```bash
   cd lims-app
   ```

2. **Install npm packages**:
   ```bash
   npm install
   ```

   This may take a few minutes. Wait for completion.

### Step 4: Build Application

1. **Build the application**:
   ```bash
   npm run build
   ```

2. **Verify build output**:
   - Check that `dist/` directory was created
   - Verify it contains `index.html` and `assets/` folder

### Step 5: Initialize Firebase (First Time Only)

If you haven't initialized Firebase CLI for this project:

1. **Login to Firebase**:
   ```bash
   firebase login
   ```

2. **Initialize Firebase**:
   ```bash
   firebase init
   ```

3. **Select services**:
   - Use arrow keys to select: **Firestore**, **Storage**, **Hosting**
   - Press Space to select, Enter to confirm

4. **Select project**:
   - Choose **"Use an existing project"**
   - Select your Firebase project from the list

5. **Configure Firestore**:
   - Use default `firestore.rules` file: **Yes**
   - Use default `firestore.indexes.json` file: **Yes**

6. **Configure Storage**:
   - Use default `storage.rules` file: **Yes**

7. **Configure Hosting**:
   - Public directory: **dist**
   - Single-page app: **Yes**
   - Set up automatic builds: **No** (or Yes if using CI/CD)
   - Overwrite index.html: **No**

### Step 6: Deploy Security Rules and Indexes

1. **Deploy Firestore rules**:
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Deploy Storage rules**:
   ```bash
   firebase deploy --only storage:rules
   ```

3. **Deploy Firestore indexes**:
   ```bash
   firebase deploy --only firestore:indexes
   ```

   **Note:** Index creation can take 5-10 minutes. You can check status in Firebase Console → Firestore → Indexes.

### Step 7: Deploy Application

1. **Deploy to Firebase Hosting**:
   ```bash
   firebase deploy --only hosting
   ```

2. **Note your hosting URL**:
   - After deployment, you'll see a URL like: `https://your-project-id.web.app`
   - This is your application URL

### Step 8: Verify Installation

1. **Open your application**:
   - Visit the hosting URL provided after deployment
   - Or go to Firebase Console → Hosting to find your URL

2. **Test functionality**:
   - Create a user account (Sign Up)
   - Log in with your credentials
   - Verify you can access the application

---

## Using the Installation Scripts

For convenience, installation scripts are provided:

### Windows (`install.bat`)

```bash
install.bat
```

This script will:
1. Check for .env file
2. Install dependencies
3. Build application
4. Deploy rules and indexes
5. Optionally deploy to hosting

### Linux/Mac (`install.sh`)

```bash
chmod +x install.sh
./install.sh
```

This script performs the same steps as the Windows version.

---

## Post-Installation

### Create First Admin User

1. **Sign up** through the application interface
2. **Go to Firebase Console** → Authentication → Users
3. **Find your user** and note the UID
4. **Go to Firestore Database** → Data → `users` collection
5. **Create or edit** your user document:
   ```json
   {
     "email": "your-email@example.com",
     "role": "admin",
     "displayName": "Your Name"
   }
   ```

### Configure Additional Settings

- **Company Information**: Set up company details in the application
- **User Roles**: Configure roles and permissions as needed
- **Email Templates**: Customize email templates if using email features

---

## Updating the Application

When you need to update the application:

1. **Pull latest changes** (if using version control)
2. **Update dependencies** (if needed):
   ```bash
   npm install
   ```
3. **Rebuild**:
   ```bash
   npm run build
   ```
4. **Redeploy**:
   ```bash
   firebase deploy
   ```

---

## Troubleshooting

### Build Errors

**Issue: "Module not found" errors**
- **Solution**: Run `npm install` again
- Check that all dependencies in `package.json` are installed

**Issue: "Environment variables not found"**
- **Solution**: Verify `.env` file exists in `lims-app/` directory
- Check that all variables start with `VITE_`
- Restart your terminal/command prompt

### Deployment Errors

**Issue: "Permission denied"**
- **Solution**: Run `firebase login` again
- Verify you have access to the Firebase project

**Issue: "Rules deployment failed"**
- **Solution**: Check syntax of `firestore.rules` and `storage.rules`
- Verify you're in the correct directory

**Issue: "Hosting deployment failed"**
- **Solution**: Verify `dist/` directory exists and contains `index.html`
- Check that `firebase.json` has correct hosting configuration

### Runtime Errors

**Issue: "Firebase connection failed"**
- **Solution**: Verify `.env` file has correct credentials
- Check browser console for specific error messages
- Verify Firebase services are enabled in Firebase Console

**Issue: "Permission denied" when using app**
- **Solution**: Verify security rules are deployed
- Check that user is authenticated
- Review Firestore/Storage rules for the operation

---

## File Structure

After installation, your structure should look like:

```
lims-app/
├── .env                 # Your Firebase configuration (DO NOT commit)
├── dist/                # Built application (generated)
├── node_modules/        # Dependencies (generated)
├── firebase.json        # Firebase configuration
├── firestore.rules      # Firestore security rules
├── storage.rules        # Storage security rules
├── firestore.indexes.json # Firestore indexes
├── package.json         # Node.js dependencies
└── ...                  # Other files
```

---

## Security Best Practices

1. **Never commit `.env` file** to version control
2. **Keep security rules updated** as your application evolves
3. **Regularly review** Firebase Console for security alerts
4. **Use strong passwords** for Firebase project
5. **Enable 2FA** on your Firebase account
6. **Limit access** to Firebase project to authorized personnel only

---

## Support

For additional help:

1. Review `COMMERCIAL_DISTRIBUTION_SETUP.md` for Firebase setup
2. Check Firebase Console for error messages
3. Review browser console for client-side errors
4. Consult Firebase documentation: https://firebase.google.com/docs

---

## Quick Reference Commands

```bash
# Install dependencies
npm install

# Build application
npm run build

# Deploy everything
firebase deploy

# Deploy only hosting
firebase deploy --only hosting

# Deploy only rules
firebase deploy --only firestore:rules,storage:rules

# Deploy only indexes
firebase deploy --only firestore:indexes

# View Firebase logs
firebase functions:log
```

---

**Last Updated:** 2025-01-14
