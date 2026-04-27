import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, db } from './firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const AVATAR_STORAGE_PATH = 'users';

/**
 * Preset avatar images
 * These are simple colored avatars with initials or icons
 */
export const PRESET_AVATARS = [
  { id: 'blue', color: '#3B82F6', name: 'Blue' },
  { id: 'green', color: '#10B981', name: 'Green' },
  { id: 'purple', color: '#8B5CF6', name: 'Purple' },
  { id: 'pink', color: '#EC4899', name: 'Pink' },
  { id: 'orange', color: '#F59E0B', name: 'Orange' },
  { id: 'red', color: '#EF4444', name: 'Red' },
  { id: 'indigo', color: '#6366F1', name: 'Indigo' },
  { id: 'teal', color: '#14B8A6', name: 'Teal' },
  { id: 'yellow', color: '#EAB308', name: 'Yellow' },
  { id: 'gray', color: '#6B7280', name: 'Gray' },
];

/**
 * Generate a preset avatar URL based on initials and color
 */
export const generatePresetAvatarUrl = (initials: string, colorId: string): string => {
  const preset = PRESET_AVATARS.find(p => p.id === colorId) || PRESET_AVATARS[0];
  // Create a data URL for a simple colored circle with initials
  const svg = `
    <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="50" fill="${preset.color}"/>
      <text x="50" y="50" font-family="Arial, sans-serif" font-size="36" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${initials}</text>
    </svg>
  `;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

/**
 * Upload user avatar to Firebase Storage
 */
export const uploadUserAvatar = async (userId: string, file: File): Promise<string> => {
  try {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      throw new Error('File must be an image');
    }

    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      throw new Error('Image size must be less than 2MB');
    }

    // Create storage reference
    const fileExtension = file.name.split('.').pop();
    const fileName = `avatar.${fileExtension}`;
    const storageRef = ref(storage, `${AVATAR_STORAGE_PATH}/${userId}/avatar/${fileName}`);

    // Upload file
    await uploadBytes(storageRef, file);

    // Get download URL
    const downloadURL = await getDownloadURL(storageRef);

    return downloadURL;
  } catch (error) {
    console.error('Error uploading avatar:', error);
    throw error;
  }
};

/**
 * Delete user avatar from Firebase Storage
 */
export const deleteUserAvatar = async (avatarUrl: string): Promise<void> => {
  try {
    // Extract the path from the URL
    const url = new URL(avatarUrl);
    const pathMatch = url.pathname.match(/\/o\/(.+)\?/);
    
    if (pathMatch) {
      const filePath = decodeURIComponent(pathMatch[1]);
      const storageRef = ref(storage, filePath);
      await deleteObject(storageRef);
    }
  } catch (error) {
    console.error('Error deleting avatar:', error);
    // Don't throw - it's okay if deletion fails (file might not exist)
  }
};

/**
 * Update user avatar URL in Firestore
 */
export const updateUserAvatar = async (userId: string, avatarUrl: string | null): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      avatarUrl: avatarUrl || null,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating user avatar:', error);
    throw error;
  }
};

/**
 * Save user avatar (upload and update Firestore)
 */
export const saveUserAvatar = async (
  userId: string,
  file: File | null,
  presetColorId: string | null = null,
  initials: string = 'U'
): Promise<string> => {
  try {
    let avatarUrl: string | null = null;

    if (file) {
      // Upload custom image
      avatarUrl = await uploadUserAvatar(userId, file);
    } else if (presetColorId) {
      // Generate preset avatar
      avatarUrl = generatePresetAvatarUrl(initials, presetColorId);
    }

    // Update user document
    if (avatarUrl) {
      await updateUserAvatar(userId, avatarUrl);
    }

    return avatarUrl || '';
  } catch (error) {
    console.error('Error saving user avatar:', error);
    throw error;
  }
};

/**
 * Remove user avatar
 */
export const removeUserAvatar = async (userId: string, currentAvatarUrl: string | null): Promise<void> => {
  try {
    // Delete from storage if it's not a preset (data URL)
    if (currentAvatarUrl && !currentAvatarUrl.startsWith('data:')) {
      await deleteUserAvatar(currentAvatarUrl);
    }

    // Update user document
    await updateUserAvatar(userId, null);
  } catch (error) {
    console.error('Error removing user avatar:', error);
    throw error;
  }
};






























