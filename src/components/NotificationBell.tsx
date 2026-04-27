import React, { useState, useEffect, useRef } from 'react';
import { firestoreToDate } from '../utils/dateUtils';
import { useAuth } from '../contexts/AuthContext';
import { db, collection, query, where, onSnapshot, orderBy, updateDoc, doc } from '../services/firebase';
import type { Notification } from '../services/notificationService';

interface NotificationBellProps {
  onOpenChange?: (isOpen: boolean) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ onOpenChange }) => {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifyOpenChange = (isOpen: boolean) => {
    onOpenChange?.(isOpen);
  };

  useEffect(() => {
    if (!currentUser) return;

    let unsubscribe: (() => void) | null = null;

    // Try to query with orderBy first (requires composite index)
    // If it fails, fall back to simple query without orderBy
    const tryQueryWithOrderBy = () => {
      try {
        const q = query(
          collection(db, 'notifications'),
          where('userId', '==', currentUser.uid),
          orderBy('createdAt', 'desc')
        );

        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const notifs = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
              createdAt: firestoreToDate(doc.data().createdAt),
            })) as Notification[];

            setNotifications(notifs);
            setUnreadCount(notifs.filter((n) => !n.read).length);
          },
          (error: any) => {
            // If index doesn't exist, use fallback query
            if (error.code === 'failed-precondition' || error.message?.includes('index')) {
              console.warn('Composite index not found, using fallback query. Create index at:', error.message);
              tryQueryWithoutOrderBy();
            } else {
              console.error('Error loading notifications:', error);
            }
          }
        );
      } catch (error) {
        // If query construction fails, use fallback
        console.warn('Query construction failed, using fallback:', error);
        tryQueryWithoutOrderBy();
      }
    };

    // Fallback query without orderBy (no index required)
    const tryQueryWithoutOrderBy = () => {
      const simpleQ = query(
        collection(db, 'notifications'),
        where('userId', '==', currentUser.uid)
      );

      unsubscribe = onSnapshot(
        simpleQ,
        (snapshot) => {
          const notifs = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            createdAt: firestoreToDate(doc.data().createdAt),
          })) as Notification[];

          // Sort by createdAt manually (newest first)
          notifs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

          setNotifications(notifs);
          setUnreadCount(notifs.filter((n) => !n.read).length);
        },
        (error) => {
          console.error('Error loading notifications (fallback query):', error);
        }
      );
    };

    // Start with the indexed query
    tryQueryWithOrderBy();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [currentUser]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
        notifyOpenChange(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showDropdown]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: true,
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const unreadNotifications = notifications.filter((n) => !n.read);
      await Promise.all(
        unreadNotifications.map((n) =>
          updateDoc(doc(db, 'notifications', n.id), { read: true })
        )
      );
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  if (!currentUser) return null;

  return (
    <div className="relative">
      <button
        onClick={() => {
          const next = !showDropdown;
          setShowDropdown(next);
          notifyOpenChange(next);
        }}
        className="relative flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-all"
        title="Notifications"
      >
        <svg className="w-6 h-6 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div ref={dropdownRef} className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-20 max-h-96 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
              <h3 className="font-semibold text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-xs text-primary-600 hover:text-primary-700"
                >
                  Mark all as read
                </button>
              )}
            </div>
            <div className="overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-500 text-sm">
                  No notifications
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                      !notification.read ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => {
                      if (!notification.read) {
                        handleMarkAsRead(notification.id);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {notification.title}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(notification.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {!notification.read && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full ml-2 flex-shrink-0 mt-1" />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
      )}
    </div>
  );
};
