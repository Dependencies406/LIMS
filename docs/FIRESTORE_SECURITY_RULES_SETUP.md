# 🔒 Firestore Security Rules Setup for User Management

**Issue**: `Missing or insufficient permissions` error when accessing User Management  
**Solution**: Configure Firestore security rules for the `users` collection

---

## 🎯 Quick Fix

### **Step 1: Open Firebase Console**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **scs-lims**
3. Click **"Firestore Database"** in the left sidebar
4. Click **"Rules"** tab

### **Step 2: Update Security Rules**
Replace your current rules with this configuration:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow authenticated users to read/write their own user document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      // Allow admin users to read/write all user documents
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Existing rules for other collections (jobs, customers, etc.)
    match /jobs/{jobId} {
      allow read, write: if request.auth != null;
    }
    
    match /customers/{customerId} {
      allow read, write: if request.auth != null;
    }
    
    match /jobIdSettings/{document} {
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    match /companyInfo/{document} {
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    match /pdfSettings/{document} {
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

### **Step 3: Publish Rules**
1. Click **"Publish"** button
2. Rules will be active immediately

---

## 🔧 Alternative: Simpler Rules (Development Only)

If you want to test quickly during development, you can use these simpler rules **ONLY for testing**:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // WARNING: These rules allow all authenticated users full access
    // ONLY use this for development/testing
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**⚠️ Important**: Never use the simple rules in production!

---

## 📋 Step-by-Step Instructions

### **1. Access Firebase Console**
```
URL: https://console.firebase.google.com/
Project: scs-lims
```

### **2. Navigate to Firestore Rules**
```
Left Sidebar → Firestore Database → Rules tab
```

### **3. Replace Current Rules**
- Select all existing rules (Ctrl+A)
- Delete them
- Paste the new rules from above
- Click **"Publish"**

### **4. Verify Rules**
- Rules should show as "Published"
- No syntax errors should be displayed
- Green checkmark indicates success

---

## 🛡️ Rule Explanation

### **User Collection Rules:**
```javascript
match /users/{userId} {
  // Users can read/write their own document
  allow read, write: if request.auth != null && request.auth.uid == userId;
  
  // Admins can read/write all user documents
  allow read, write: if request.auth != null && 
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}
```

**What this means:**
- ✅ Users can access their own profile
- ✅ Admin users can access all user profiles
- ❌ Regular users cannot access other users' profiles
- ✅ Only authenticated users can access

---

## 🚨 Troubleshooting

### **Error: "Rules are not valid"**
**Solution:**
- Check for syntax errors (missing semicolons, brackets)
- Ensure proper indentation
- Verify all quotes are correct

### **Error: "Permission denied" still occurs**
**Possible Causes:**
1. **User doesn't have admin role** - Check user document in Firestore
2. **Rules not published** - Make sure you clicked "Publish"
3. **Browser cache** - Try hard refresh (Ctrl+F5)
4. **User not authenticated** - Ensure user is logged in

### **Error: "User document not found"**
**Solution:**
- Create user documents in Firestore manually
- Or use the User Management feature to create them

---

## 🔍 Verifying User Documents

### **Check if User Documents Exist:**
1. Go to Firestore Database → Data
2. Look for `users` collection
3. Verify user documents exist with `role` field

### **Expected User Document Structure:**
```javascript
{
  email: "admin@example.com",
  firstName: "Admin",
  lastName: "User",
  displayName: "Admin User",
  role: "admin",  // ← This is crucial
  isActive: true,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

---

## 📝 Creating First Admin User

### **Method 1: Firebase Console**
1. Go to Firestore Database → Data
2. Create collection: `users`
3. Add document with your user ID as document ID
4. Add fields: `email`, `firstName`, `lastName`, `role: "admin"`

### **Method 2: Using User Management (After Rules Setup)**
1. Set up security rules first
2. Log in as admin
3. Go to Settings → User Management
4. Create new users through the interface

---

## 🎯 Testing the Fix

### **After Setting Up Rules:**
1. **Refresh your LIMS application**
2. **Go to Settings → User Management**
3. **Should see either:**
   - User list (if users exist)
   - "No Users Found" message (if no users exist)
   - **NOT** the permission error

### **Expected Results:**
- ✅ No more permission errors
- ✅ User Management loads properly
- ✅ Can create/edit users (if admin)
- ✅ Statistics display correctly

---

## 🔒 Security Best Practices

### **Production Rules Should:**
- ✅ Only allow admin access to user management
- ✅ Restrict user access to their own data
- ✅ Validate user roles properly
- ✅ Include proper authentication checks

### **Never Use in Production:**
- ❌ `allow read, write: if true;` (allows anyone)
- ❌ `allow read, write: if false;` (blocks everything)
- ❌ Rules without authentication checks

---

## 📞 Need Help?

### **Common Issues:**
1. **Still getting permission errors** → Check user role in Firestore
2. **Rules won't publish** → Check syntax errors
3. **Users can't access their own data** → Verify rule structure
4. **Admin can't manage users** → Ensure admin role is set correctly

### **Quick Verification:**
- Go to Firestore → Data
- Check `users` collection exists
- Verify your user document has `role: "admin"`
- Confirm rules are published (green checkmark)

---

## ✅ Success Checklist

- [ ] Firebase Console accessed
- [ ] Firestore Rules updated
- [ ] Rules published successfully
- [ ] User documents exist with proper roles
- [ ] LIMS application refreshed
- [ ] User Management loads without errors
- [ ] Can create/edit users (if admin)

---

**After completing these steps, the User Management feature should work perfectly!** 🎉

---

Last Updated: October 13, 2025  
Status: Ready for Implementation
