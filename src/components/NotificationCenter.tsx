import React, { useState, useEffect } from 'react';
import { firestoreToDate } from '../utils/dateUtils';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db, collection, query, where, onSnapshot, orderBy, updateDoc, doc, getDocs } from '../services/firebase';
import type { Notification } from '../services/notificationService';

interface NotificationCenterProps {
  maxNotifications?: number;
  onNavigate?: () => void; // Callback to close parent popup when navigating
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ maxNotifications = 10, onNavigate }) => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

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

            // Limit to maxNotifications
            const limitedNotifs = notifs.slice(0, maxNotifications);

            setNotifications(limitedNotifs);
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

          // Limit to maxNotifications
          const limitedNotifs = notifs.slice(0, maxNotifications);

          setNotifications(limitedNotifs);
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
  }, [currentUser, maxNotifications]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: true,
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read if unread
    if (!notification.read) {
      await handleMarkAsRead(notification.id);
    }

    // Navigate to job if it's a job-related notification
    if (notification.jobId && (notification.type === 'job_assigned' || notification.type === 'job_message')) {
      try {
        // Find the job document by jobId field
        const jobsQuery = query(
          collection(db, 'jobs'),
          where('jobId', '==', notification.jobId)
        );
        const jobsSnapshot = await getDocs(jobsQuery);
        
        if (!jobsSnapshot.empty) {
          // Get the first matching job (jobId should be unique)
          const jobDoc = jobsSnapshot.docs[0];
          // Close parent popup if callback provided
          if (onNavigate) {
            onNavigate();
          }
          // Navigate to job detail page using document ID
          navigate(`/jobs/${jobDoc.id}`);
        } else {
          console.warn('Job not found for jobId:', notification.jobId);
        }
      } catch (error) {
        console.error('Error finding job:', error);
      }
    }
  };

  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (!currentUser) return null;

  const recentNotifications = notifications.slice(0, maxNotifications);

  return (
    <div className="border-t border-gray-200 pt-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-900">Notifications</h4>
        {unreadCount > 0 && (
          <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
            {unreadCount}
          </span>
        )}
      </div>
      
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {recentNotifications.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-500">
            No notifications
          </div>
        ) : (
          recentNotifications.map((notification) => (
            <div
              key={notification.id}
              className={`px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                !notification.read 
                  ? 'bg-blue-50 hover:bg-blue-100 border-l-2 border-blue-500' 
                  : 'hover:bg-gray-50'
              } ${notification.jobId ? 'hover:bg-blue-50' : ''}`}
              onClick={() => handleNotificationClick(notification)}
            >
              <div className="flex items-start gap-2">
                {!notification.read && (
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 leading-snug">
                    {notification.title}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5 leading-snug" style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {notification.message}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatTimeAgo(notification.createdAt)}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
