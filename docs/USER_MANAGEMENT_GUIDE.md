# User Management - Complete Guide

## 📘 Overview

This guide explains how to use the User Management system in your LIMS application.

---

## 🎯 Quick Access

**For Admins Only:**
1. Log in as administrator
2. Click **"Users"** (👤) in the left sidebar
3. You'll see the User Management page

**For Staff:**
- User Management is not visible
- Access is restricted to administrators only

---

## 📋 User Management Features

### 1. View All Users

The Users page shows:
- **Statistics Dashboard** - Real-time counts
- **User List** - All system users
- **View Options** - List, Card, or Grid
- **Search & Filter** - Find users quickly

### 2. User Information Tracked

Each user has:
- ✅ First Name & Last Name
- ✅ Email Address
- ✅ Position (Job Title)
- ✅ Role (Admin or Staff)
- ✅ Status (Active or Inactive)
- ✅ Last Login Time
- ✅ Account Creation Date
- ✅ Last Updated Date

### 3. User Management Actions

**Available Actions:**
- Edit user profile
- Change user role
- Update position
- Deactivate user
- Reactivate user
- View user activity

---

## 🔐 User Roles

### Admin Role:
**Permissions:**
- ✅ Access all pages (Jobs, Customers, Users, Settings)
- ✅ Manage users (create, edit, deactivate)
- ✅ Change job status
- ✅ Configure system settings
- ✅ View all data

**Use For:**
- Laboratory managers
- System administrators
- Supervisors

### Staff Role:
**Permissions:**
- ✅ Access Jobs and Customers pages
- ✅ Create and edit jobs
- ✅ Manage customers
- ❌ Cannot access User Management
- ❌ Cannot access Settings
- ❌ Cannot change job status (read-only)

**Use For:**
- Laboratory technicians
- Staff members
- Regular employees

---

## 📝 How to Create a New User

### Step 1: Create Firebase Auth Account

1. Open [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **scs-lims**
3. Go to: **Authentication** → **Users**
4. Click **"Add User"**
5. Enter:
   - Email address
   - Password (user will use this to log in)
6. Click **"Add User"**
7. **Copy the User ID (UID)** - you'll need it

### Step 2: Create User Profile in LIMS

1. Log into LIMS as admin
2. Go to **Users** page
3. Click **"+ Create User"**
4. Fill in the form:
   - First Name
   - Last Name
   - Email (same as Firebase)
   - Position (optional)
   - Role (Admin or Staff)
5. Click **"Create User"**

### Step 3: User Can Now Log In

The user can now:
- Go to your LIMS login page
- Enter their email and password
- Access the system based on their role

---

## ✏️ How to Edit a User

1. Go to **Users** page
2. Click on the user you want to edit
3. User modal opens
4. Make your changes:
   - Update name
   - Change position
   - Modify role
   - Toggle active status
5. Click **"Update User"**

---

## 🚫 How to Deactivate a User

**When to Use:**
- Employee leaves the company
- Temporary account suspension
- User no longer needs access

**How to Deactivate:**
1. Go to **Users** page
2. Click on the user
3. In the modal, either:
   - **Option A**: Uncheck "Active Account" box
   - **Option B**: Click "Deactivate User" button
4. Confirm the action

**Result:**
- User cannot log in
- User data is preserved
- Can be reactivated later
- Historical records maintained

---

## ✅ How to Reactivate a User

1. Filter to show inactive users (click "Inactive" stat card)
2. Click on the inactive user
3. In the modal, either:
   - **Option A**: Check "Active Account" box
   - **Option B**: Click "Reactivate User" button
4. Confirm the action

**Result:**
- User can log in again
- All permissions restored
- Access to previous work

---

## 🔍 Search & Filter

### Search Users:
- Click the search icon (🔍)
- Type to search by:
  - First name
  - Last name
  - Email
  - Position
- Results filter in real-time

### Filter by Role:
Click on statistics cards:
- **Admins** card - Show only administrators
- **Staff** card - Show only staff members
- Click again - Show all users

### Filter by Status:
- **Active** card - Show only active users
- **Inactive** card - Show only inactive users
- Click again - Show all users

---

## 📊 Statistics Dashboard

The dashboard shows:
- **Total Users** - All users in system
- **Active** - Currently active users
- **Inactive** - Deactivated users
- **Admins** - Administrator count
- **Staff** - Staff member count

**Tip:** Click any stat card to filter the list!

---

## 🎨 View Modes

Choose how to display users:

### List View 📋
- Table format
- All fields visible
- Best for detailed review
- Good for data analysis

### Card View 🃏 (Default)
- Detailed user cards
- User avatars
- Easy to read
- Balanced information

### Grid View 🏁
- Compact layout
- Maximum users visible
- Essential info only
- Quick browsing

---

## 🔮 Upcoming Features

The system is ready for these features:

### 1. Training Logs
**Purpose:** Track employee training and certifications
**Fields:**
- Training name
- Completion date
- Expiry date
- Certificate upload
- Instructor name

### 2. Document Storage
**Purpose:** Store employee documents
**Types:**
- ID documents
- Certifications
- Contracts
- Performance reviews

### 3. Activity Logs
**Purpose:** Track user actions
**Track:**
- Login history
- Job modifications
- Account changes
- Audit trail

---

## ⚠️ Important Information

### About User Creation:

**Current Process:**
1. Create in Firebase Console first
2. Create profile in LIMS second

**Why Two Steps?**
- Security: User creation needs elevated permissions
- Firebase Admin SDK required for direct creation
- Frontend apps don't have these permissions by default

**Future:**
We're planning to add Firebase Cloud Functions to enable one-click user creation directly from LIMS!

### About User Deletion:

**Recommendation:**
- ✅ **Use "Deactivate"** - This is reversible and preserves data
- ⚠️ **Avoid "Delete"** - This is permanent

**Why?**
- Deactivation preserves audit trail
- Historical job records remain linked
- Can be undone if needed
- Best practice for data integrity

---

## 🆘 Troubleshooting

### Can't see Users page?
**Check:**
- Are you logged in as admin?
- Check your role in user profile
- Try logging out and back in

### Can't create users?
**Solution:**
- Create Firebase Auth account first
- Then create LIMS profile
- See "How to Create a New User" section

### Last login not updating?
**Check:**
- User must log in (not just stay logged in)
- Check browser console for errors
- Verify Firestore permissions

### User not receiving updates?
**Check:**
- Real-time sync is enabled
- No firewall blocking Firestore
- User has active internet connection

---

## 💡 Tips & Best Practices

### 1. Regular Reviews
- Review user list monthly
- Deactivate unused accounts
- Update positions as needed
- Verify roles are correct

### 2. Security
- Use strong passwords for all users
- Review admin assignments regularly
- Deactivate users immediately when they leave
- Never share admin credentials

### 3. Organization
- Use clear, descriptive positions
- Keep names up to date
- Maintain accurate email addresses
- Document role changes

### 4. Preparation for Future
- Keep user data complete and accurate
- This will help when adding training logs
- Document storage will link to existing users
- Clean data = easier feature additions

---

## 📚 Quick Reference

### Common Tasks:

| Task | Steps |
|------|-------|
| **Create User** | Firebase Console → Add User → LIMS → Create Profile |
| **Edit User** | Users Page → Click User → Edit → Save |
| **Change Role** | Edit User → Select Role → Save |
| **Deactivate** | Edit User → Uncheck Active → Save |
| **Reactivate** | Edit User → Check Active → Save |
| **Search** | Click 🔍 → Type search term |
| **Filter** | Click stat card to filter |
| **Change View** | Click List/Card/Grid buttons |

---

## 🎯 Summary

The User Management system provides:
- ✅ Complete user administration
- ✅ Role-based access control
- ✅ Activity tracking
- ✅ Flexible viewing options
- ✅ Search and filter tools
- ✅ Future-ready architecture

**Everything you need to manage your team effectively!** 🌟

---

**Need Help?** Check `FEATURE_USER_MANAGEMENT.md` for technical details.

Last Updated: October 13, 2025

