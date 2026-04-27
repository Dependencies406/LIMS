import type { ServiceRequest, ServiceRequestInput } from '../types';
import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot
} from './firebase';

/** Drop undefined recursively so Firestore accepts the payload (timestamps added after this). */
function stripUndefinedForWrite<T>(input: T): T {
  return JSON.parse(JSON.stringify(input)) as T;
}

/**
 * Service for managing service requests
 */
export const serviceRequestService = {
  /**
   * Subscribe to real-time service request updates
   * @param callback Function called when requests change
   * @returns Unsubscribe function
   */
  subscribeToServiceRequests(
    callback: (requests: ServiceRequest[], error?: Error) => void,
    status?: 'Pending' | 'Converted' | 'Cancelled'
  ): () => void {
    let q = query(collection(db, 'serviceRequests'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let requests = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
          } as ServiceRequest;
        });
        
        // Filter by status if provided
        if (status) {
          requests = requests.filter(req => req.status === status);
        }
        
        callback(requests);
      },
      (error) => {
        console.error('Error loading service requests:', error);
        callback([], error as Error);
      }
    );

    return unsubscribe;
  },

  /**
   * Get all service requests
   * @param status Optional status filter
   * @returns Promise with array of service requests
   */
  async getAllServiceRequests(status?: 'Pending' | 'Converted' | 'Cancelled'): Promise<ServiceRequest[]> {
    try {
      const q = query(collection(db, 'serviceRequests'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      let requests = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        } as ServiceRequest;
      });
      
      // Filter by status if provided
      if (status) {
        requests = requests.filter(req => req.status === status);
      }
      
      return requests;
    } catch (error) {
      console.error('Error fetching service requests:', error);
      throw new Error('Failed to fetch service requests');
    }
  },

  /**
   * Get a single service request by ID
   * @param id Service request document ID
   * @returns Promise with service request data
   */
  async getServiceRequestById(id: string): Promise<ServiceRequest> {
    try {
      const requestDoc = await getDoc(doc(db, 'serviceRequests', id));
      
      if (!requestDoc.exists()) {
        throw new Error('Service request not found');
      }

      return {
        id: requestDoc.id,
        ...requestDoc.data(),
        createdAt: requestDoc.data().createdAt?.toDate() || new Date(),
        updatedAt: requestDoc.data().updatedAt?.toDate() || new Date(),
      } as ServiceRequest;
    } catch (error) {
      console.error('Error fetching service request:', error);
      throw error;
    }
  },

  /**
   * Create a new service request
   * @param data Service request input data
   * @param userId ID of user creating the request
   * @returns Promise with created request ID
   */
  async createServiceRequest(data: ServiceRequestInput, userId?: string): Promise<string> {
    try {
      if (!data.customerCompanyName || !data.address || !data.contactName || !data.email || !data.phoneNumber) {
        throw new Error('Required fields are missing');
      }

      if (!data.equipment || data.equipment.length === 0) {
        throw new Error('At least one equipment entry is required');
      }

      const cleaned = stripUndefinedForWrite(data);
      const newRequestRef = doc(collection(db, 'serviceRequests'));
      await setDoc(newRequestRef, {
        ...cleaned,
        status: 'Pending' as const,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(userId ? { createdBy: userId } : {}),
      });

      return newRequestRef.id;
    } catch (error) {
      console.error('Error creating service request:', error);
      throw error;
    }
  },

  /**
   * Update an existing service request
   * @param id Service request document ID
   * @param data Partial service request data to update
   */
  async updateServiceRequest(id: string, data: Partial<ServiceRequestInput>): Promise<void> {
    try {
      const cleaned = stripUndefinedForWrite(data);
      await updateDoc(doc(db, 'serviceRequests', id), {
        ...cleaned,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating service request:', error);
      throw error;
    }
  },

  /**
   * Mark service request as converted to job
   * @param id Service request document ID
   * @param jobId Job ID that this request was converted to
   */
  async convertToJob(id: string, jobId: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'serviceRequests', id), {
        status: 'Converted',
        convertedToJobId: jobId,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error converting service request to job:', error);
      throw error;
    }
  },

  /**
   * Cancel a service request
   * @param id Service request document ID
   */
  async cancelServiceRequest(id: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'serviceRequests', id), {
        status: 'Cancelled',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error cancelling service request:', error);
      throw error;
    }
  },
};
