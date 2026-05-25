import { db, storage } from '../lib/firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  getDoc, 
  doc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  onSnapshot
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from 'firebase/storage';

/**
 * Custom hook providing CRUD and storage operations for SACE Firestore collections:
 * - products
 * - lab_reports
 * - regulations
 */
export const useSaceDatabase = () => {
  
  /**
   * Helper promise wrapper to enforce timeout on async operations.
   */
  const withTimeout = (promise, ms = 15000) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(
          "Firebase Storage upload timed out after 15s. This usually happens because:\n" +
          "1. You have not enabled/activated the Storage service in your Firebase Console (click 'Storage' in the left menu and then click 'Get Started').\n" +
          "2. Your Storage Security Rules block writes (e.g. they are set to 'allow read, write: if false;'). Set rules to 'allow read, write: if true;' for development/testing.\n" +
          "3. The storage bucket name in '.env' is incorrect or mismatched."
        ));
      }, ms);

      promise.then(
        (res) => {
          clearTimeout(timer);
          resolve(res);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  };

  /**
   * Helper function to upload a file to Firebase Storage under a designated path prefix.
   * Prepends a timestamp to prevent filename collision.
   * @param {string} folderPath Directory prefix in bucket
   * @param {File} file File binary object from input
   * @returns {Promise<string|null>} Public download URL
   */
  const uploadFileToStorage = async (folderPath, file) => {
    if (!file) return null;
    
    // Fail immediately if placeholder credentials are used in the .env configuration
    const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
    if (!apiKey || apiKey.includes('Placeholder') || apiKey === '') {
      throw new Error(
        "Firebase Web SDK is using placeholder credentials in 'frontend/.env'. " +
        "Please replace the placeholder values with your real Firebase Web App configuration keys from the Firebase Console to enable storage uploads."
      );
    }
    
    try {
      const timestamp = Date.now();
      const storageRef = ref(storage, `${folderPath}/${timestamp}_${file.name}`);
      
      // Wrap uploadBytes in a 15-second timeout race
      const snapshot = await withTimeout(uploadBytes(storageRef, file), 15000);
      
      const downloadUrl = await getDownloadURL(snapshot.ref);
      return downloadUrl;
    } catch (error) {
      console.error(`Storage upload failed in folder '${folderPath}':`, error);
      throw error;
    }
  };
  
  // =========================================================================
  // 1. PRODUCTS COLLECTION CRUD
  // =========================================================================
  
  /**
   * Creates a new product document. Uploads all attached spec files.
   * @param {Object} productData `{ name: string, category: string }`
   * @param {File[]} specFiles Array of files
   * @returns {Promise<Object>} The newly created document with generated ID
   */
  const createProduct = async (productData, specFiles = []) => {
    try {
      const specFileUrls = [];
      for (const file of specFiles) {
        const url = await uploadFileToStorage('products/spec_files', file);
        if (url) specFileUrls.push(url);
      }
      
      const payload = {
        name: productData.name,
        category: productData.category,
        specFileUrls: specFileUrls,
        createdAt: new Date().toISOString()
      };
      
      const docRef = await addDoc(collection(db, 'products'), payload);
      return { id: docRef.id, ...payload };
    } catch (error) {
      console.error("Error creating product:", error);
      throw error;
    }
  };

  /**
   * Retrieves all product documents.
   * @returns {Promise<Object[]>}
   */
  const getProducts = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'products'));
      const products = [];
      querySnapshot.forEach((doc) => {
        products.push({ id: doc.id, ...doc.data() });
      });
      return products;
    } catch (error) {
      console.error("Error getting products:", error);
      throw error;
    }
  };

  /**
   * Retrieves a single product document by ID.
   * @param {string} productId 
   * @returns {Promise<Object>}
   */
  const getProductById = async (productId) => {
    try {
      const docRef = doc(db, 'products', productId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      } else {
        throw new Error("Product not found");
      }
    } catch (error) {
      console.error(`Error getting product ${productId}:`, error);
      throw error;
    }
  };

  /**
   * Updates an existing product's metadata and appends any newly uploaded spec files.
   * @param {string} productId 
   * @param {Object} updatedData `{ name?: string, category?: string }`
   * @param {File[]} newSpecFiles Additional spec files to upload
   */
  const updateProduct = async (productId, updatedData, newSpecFiles = []) => {
    try {
      const docRef = doc(db, 'products', productId);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) throw new Error("Product not found");
      
      const currentData = docSnap.data();
      const specFileUrls = [...(currentData.specFileUrls || [])];
      
      for (const file of newSpecFiles) {
        const url = await uploadFileToStorage('products/spec_files', file);
        if (url) specFileUrls.push(url);
      }
      
      const updatePayload = {
        ...updatedData,
        specFileUrls,
        updatedAt: new Date().toISOString()
      };
      
      await updateDoc(docRef, updatePayload);
      return { id: productId, ...updatePayload };
    } catch (error) {
      console.error(`Error updating product ${productId}:`, error);
      throw error;
    }
  };

  /**
   * Deletes a product from Firestore.
   * @param {string} productId 
   */
  const deleteProduct = async (productId) => {
    try {
      const docRef = doc(db, 'products', productId);
      await deleteDoc(docRef);
      return { success: true, id: productId };
    } catch (error) {
      console.error(`Error deleting product ${productId}:`, error);
      throw error;
    }
  };

  /**
   * Attaches a real-time listener to the products collection.
   * @param {function} callback Function called with updated products array
   * @returns {function} Unsubscribe function
   */
  const subscribeProducts = (callback) => {
    try {
      const q = collection(db, 'products');
      return onSnapshot(q, (snapshot) => {
        const products = [];
        snapshot.forEach((doc) => {
          products.push({ id: doc.id, ...doc.data() });
        });
        callback(products);
      }, (error) => {
        console.error("Real-time products subscription failed:", error);
      });
    } catch (error) {
      console.error("Error setting up real-time products subscription:", error);
      throw error;
    }
  };

  /**
   * Attaches a real-time listener to the regulations collection filtered by productId.
   * @param {string} productId Filter target product
   * @param {function} callback Function called with updated regulations array
   * @returns {function} Unsubscribe function
   */
  const subscribeRegulationsByProduct = (productId, callback) => {
    try {
      if (!productId) {
        callback([]);
        return () => {};
      }
      const q = query(collection(db, 'regulations'), where('productId', '==', productId));
      return onSnapshot(q, (snapshot) => {
        const regulations = [];
        snapshot.forEach((doc) => {
          regulations.push({ id: doc.id, ...doc.data() });
        });
        callback(regulations);
      }, (error) => {
        console.error(`Real-time regulations subscription failed for product ${productId}:`, error);
      });
    } catch (error) {
      console.error("Error setting up real-time regulations subscription:", error);
      throw error;
    }
  };

  /**
   * Attaches a real-time listener to the lab_reports collection filtered by productId.
   * @param {string} productId Filter target product
   * @param {function} callback Function called with updated lab reports array
   * @returns {function} Unsubscribe function
   */
  const subscribeLabReportsByProduct = (productId, callback) => {
    try {
      if (!productId) {
        callback([]);
        return () => {};
      }
      const q = query(collection(db, 'lab_reports'), where('productId', '==', productId));
      return onSnapshot(q, (snapshot) => {
        const reports = [];
        snapshot.forEach((doc) => {
          reports.push({ id: doc.id, ...doc.data() });
        });
        callback(reports);
      }, (error) => {
        console.error(`Real-time lab reports subscription failed for product ${productId}:`, error);
      });
    } catch (error) {
      console.error("Error setting up real-time lab reports subscription:", error);
      throw error;
    }
  };

  // =========================================================================
  // 2. LAB REPORTS COLLECTION CRUD
  // =========================================================================

  /**
   * Creates a new lab report entry. Uploads the report evidence file.
   * @param {string} productId Associated product ID
   * @param {Object} extractedData Structured JSON parsed from report visual crops
   * @param {File} reportFile Raw PDF or Image report document
   */
  const createLabReport = async (productId, extractedData, reportFile) => {
    try {
      const reportFileUrl = await uploadFileToStorage('lab_reports', reportFile);
      
      const payload = {
        productId,
        extractedData, // nested JSON
        reportFileUrl,
        createdAt: new Date().toISOString()
      };
      
      const docRef = await addDoc(collection(db, 'lab_reports'), payload);
      return { id: docRef.id, ...payload };
    } catch (error) {
      console.error("Error creating lab report:", error);
      throw error;
    }
  };

  /**
   * Retrieves all lab reports.
   * @returns {Promise<Object[]>}
   */
  const getLabReports = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'lab_reports'));
      const reports = [];
      querySnapshot.forEach((doc) => {
        reports.push({ id: doc.id, ...doc.data() });
      });
      return reports;
    } catch (error) {
      console.error("Error getting lab reports:", error);
      throw error;
    }
  };

  /**
   * Queries lab reports matching a specific product association.
   * @param {string} productId 
   * @returns {Promise<Object[]>}
   */
  const getLabReportsByProduct = async (productId) => {
    try {
      const q = query(collection(db, 'lab_reports'), where('productId', '==', productId));
      const querySnapshot = await getDocs(q);
      const reports = [];
      querySnapshot.forEach((doc) => {
        reports.push({ id: doc.id, ...doc.data() });
      });
      return reports;
    } catch (error) {
      console.error(`Error getting reports for product ${productId}:`, error);
      throw error;
    }
  };

  /**
   * Updates lab report metadata and optionally uploads a new replacement report file.
   * @param {string} labReportId 
   * @param {Object} updatedData `{ extractedData?: Object }`
   * @param {File|null} newReportFile Optional new file to overwrite previous
   */
  const updateLabReport = async (labReportId, updatedData, newReportFile = null) => {
    try {
      const docRef = doc(db, 'lab_reports', labReportId);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) throw new Error("Lab report not found");
      
      let reportFileUrl = docSnap.data().reportFileUrl;
      if (newReportFile) {
        reportFileUrl = await uploadFileToStorage('lab_reports', newReportFile);
      }
      
      const updatePayload = {
        ...updatedData,
        reportFileUrl,
        updatedAt: new Date().toISOString()
      };
      
      await updateDoc(docRef, updatePayload);
      return { id: labReportId, ...updatePayload };
    } catch (error) {
      console.error(`Error updating lab report ${labReportId}:`, error);
      throw error;
    }
  };

  /**
   * Deletes a lab report.
   * @param {string} labReportId 
   */
  const deleteLabReport = async (labReportId) => {
    try {
      const docRef = doc(db, 'lab_reports', labReportId);
      await deleteDoc(docRef);
      return { success: true, id: labReportId };
    } catch (error) {
      console.error(`Error deleting lab report ${labReportId}:`, error);
      throw error;
    }
  };

  // =========================================================================
  // 3. REGULATIONS COLLECTION CRUD
  // =========================================================================

  /**
   * Creates a new regulation standard document reference.
   * @param {string} productId Associated product ID
   * @param {string} documentType MDR / IVDR standard parameter class
   * @param {File} regulationFile Regulatory reference PDF
   */
  const createRegulation = async (productId, documentType, regulationFile) => {
    try {
      const fileUrl = await uploadFileToStorage('regulations', regulationFile);
      
      const payload = {
        productId,
        documentType,
        fileUrl,
        createdAt: new Date().toISOString()
      };
      
      const docRef = await addDoc(collection(db, 'regulations'), payload);
      return { id: docRef.id, ...payload };
    } catch (error) {
      console.error("Error creating regulation standard reference:", error);
      throw error;
    }
  };

  /**
   * Retrieves all regulation documents.
   * @returns {Promise<Object[]>}
   */
  const getRegulations = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'regulations'));
      const regulations = [];
      querySnapshot.forEach((doc) => {
        regulations.push({ id: doc.id, ...doc.data() });
      });
      return regulations;
    } catch (error) {
      console.error("Error getting regulations:", error);
      throw error;
    }
  };

  /**
   * Queries regulations matching a specific product ID.
   * @param {string} productId 
   * @returns {Promise<Object[]>}
   */
  const getRegulationsByProduct = async (productId) => {
    try {
      const q = query(collection(db, 'regulations'), where('productId', '==', productId));
      const querySnapshot = await getDocs(q);
      const regulations = [];
      querySnapshot.forEach((doc) => {
        regulations.push({ id: doc.id, ...doc.data() });
      });
      return regulations;
    } catch (error) {
      console.error(`Error getting regulations for product ${productId}:`, error);
      throw error;
    }
  };

  /**
   * Updates standard reference metadata and optionally replaces the attached document.
   * @param {string} regulationId 
   * @param {Object} updatedData `{ documentType?: string }`
   * @param {File|null} newRegulationFile Replacement file
   */
  const updateRegulation = async (regulationId, updatedData, newRegulationFile = null) => {
    try {
      const docRef = doc(db, 'regulations', regulationId);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) throw new Error("Regulation reference not found");
      
      let fileUrl = docSnap.data().fileUrl;
      if (newRegulationFile) {
        fileUrl = await uploadFileToStorage('regulations', newRegulationFile);
      }
      
      const updatePayload = {
        ...updatedData,
        fileUrl,
        updatedAt: new Date().toISOString()
      };
      
      await updateDoc(docRef, updatePayload);
      return { id: regulationId, ...updatePayload };
    } catch (error) {
      console.error(`Error updating regulation ${regulationId}:`, error);
      throw error;
    }
  };

  /**
   * Deletes a regulation document.
   * @param {string} regulationId 
   */
  const deleteRegulation = async (regulationId) => {
    try {
      const docRef = doc(db, 'regulations', regulationId);
      await deleteDoc(docRef);
      return { success: true, id: regulationId };
    } catch (error) {
      console.error(`Error deleting regulation ${regulationId}:`, error);
      throw error;
    }
  };

  return {
    uploadFileToStorage,
    
    // Products
    createProduct,
    getProducts,
    getProductById,
    updateProduct,
    deleteProduct,
    subscribeProducts,
    
    // Lab Reports
    createLabReport,
    getLabReports,
    getLabReportsByProduct,
    updateLabReport,
    deleteLabReport,
    subscribeLabReportsByProduct,
    
    // Regulations
    createRegulation,
    getRegulations,
    getRegulationsByProduct,
    updateRegulation,
    deleteRegulation,
    subscribeRegulationsByProduct
  };
};
