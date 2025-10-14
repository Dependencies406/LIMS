# 🔍 Debug User Loading Issue

**Problem**: User Management only shows 1 user despite 5 users existing in Firestore  
**Status**: 🔍 **DEBUGGING IN PROGRESS**

---

## 🛠️ **Debugging Steps Applied:**

### **1. Enhanced Logging** ✅
- ✅ **Added detailed console logs** to track query execution
- ✅ **Added snapshot debugging** to see what Firestore returns
- ✅ **Added document processing logs** to track each user document

### **2. Simplified Query** ✅
- ✅ **Removed orderBy** to avoid field requirement issues
- ✅ **Using simple collection query** without sorting
- ✅ **Added query debugging** to track what's being executed

### **3. Debug Method** ✅
- ✅ **Added `debugFirestoreAccess()` method** to test Firestore access
- ✅ **Added debug button** to User Management modal
- ✅ **Tests multiple scenarios** to identify the issue

---

## 🧪 **How to Debug:**

### **Step 1: Refresh Application**
1. **Refresh your LIMS application** to get the updated code
2. **Go to Settings → User Management**

### **Step 2: Check Console Logs**
Look for these new detailed logs:
```
Setting up users subscription with query: [Query object]
Snapshot received: {size: X, empty: false, docs: X, docIds: [...]}
Processing user document: [docId] [data]
Loaded users: X [array]
```

### **Step 3: Click Debug Button**
1. **Click the "🔍 Debug" button** in User Management
2. **Check console for detailed debug output**:
   ```
   === DEBUGGING FIRESTORE ACCESS ===
   Current user UID: [your-uid]
   Current user document exists: true
   Current user data: {...}
   Simple query result: {size: X, empty: false, docs: X, docIds: [...]}
   Document 1: {id: "...", data: {...}}
   Document 2: {id: "...", data: {...}}
   ...
   === END DEBUG ===
   ```

---

## 🎯 **What to Look For:**

### **Expected Results:**
- ✅ **Snapshot size**: Should be 5 (not 1)
- ✅ **Document IDs**: Should show all 5 user IDs
- ✅ **Debug output**: Should show all 5 documents

### **If Still Showing 1 User:**
The issue is likely one of these:

1. **Security Rules Issue**: The `list` permission isn't working
2. **Query Limitation**: Firestore is filtering results
3. **Document Structure**: Some documents don't meet query criteria
4. **Authentication Issue**: Current user doesn't have proper permissions

---

## 🔧 **Next Steps Based on Debug Results:**

### **If Debug Shows 5 Documents:**
- ✅ **Query is working** - issue is in data processing
- ✅ **Fix the data mapping logic**

### **If Debug Shows 1 Document:**
- ❌ **Security rules issue** - need to fix Firestore rules
- ❌ **Query limitation** - need to adjust query logic

### **If Debug Shows 0 Documents:**
- ❌ **Permission denied** - security rules blocking access
- ❌ **Collection doesn't exist** - database structure issue

---

## 📋 **Current Firestore Rules (Should Be):**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // Explicitly allow admins to list (query) the entire users collection
    match /users {
      allow list: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Other collections...
  }
}
```

---

## 🚨 **If Rules Are Wrong:**

If the debug shows permission issues, update your Firestore rules:

1. **Go to Firebase Console → Firestore Database → Rules**
2. **Replace with the rules above**
3. **Click "Publish"**
4. **Test again**

---

## 📊 **Debug Output Analysis:**

### **Good Debug Output:**
```
Simple query result: {size: 5, empty: false, docs: 5, docIds: ["AK6UpVpTdUUmvwTfgIW...", "B9bC978Ckrdn3iafdKo...", ...]}
Document 1: {id: "AK6UpVpTdUUmvwTfgIW...", data: {email: "sila.s@scslims.com", role: "admin", ...}}
Document 2: {id: "B9bC978Ckrdn3iafdKo...", data: {email: "user2@example.com", role: "staff", ...}}
...
```

### **Bad Debug Output:**
```
Simple query result: {size: 1, empty: false, docs: 1, docIds: ["AK6UpVpTdUUmvwTfgIW..."]}
```

---

**Please run the debug and share the console output so I can identify the exact issue!** 🔍

---

Last Updated: October 13, 2025  
Status: 🔍 Debugging Tools Added  
Next: Run debug and analyze results
