import * as firestore from 'firebase/firestore';
import { instrumentCall } from './utils/datadogInstrumentation';

// A map defining which Firestore functions to instrument and how to extract context for logging.
// This design is declarative and easy to extend for other Firestore functions.
const functionsToInstrument: Record<string, (...args: any[]) => { operationName: string; context: any }> = {
    getDocs: (query: firestore.Query) => ({
        operationName: `Firestore: Get Docs`,
        context: {
            tags: { collectionName: (query as any)._query?.path?.segments[0] || 'unknown' }
        }
    }),
    addDoc: (collectionRef: firestore.CollectionReference, data: firestore.DocumentData) => ({
        operationName: `Firestore: Add Doc to ${collectionRef.id}`,
        context: {
            payload: data,
            tags: { collectionName: collectionRef.id }
        }
    }),
    updateDoc: (docRef: firestore.DocumentReference, data: Partial<firestore.DocumentData>) => ({
        operationName: `Firestore: Update Doc in ${docRef.parent.id}/${docRef.id}`,
        context: {
            payload: data,
            tags: { collectionName: docRef.parent.id, docId: docRef.id }
        }
    }),
    deleteDoc: (docRef: firestore.DocumentReference) => ({
        operationName: `Firestore: Delete Doc from ${docRef.parent.id}/${docRef.id}`,
        context: {
            tags: { collectionName: docRef.parent.id, docId: docRef.id }
        }
    }),
    // NOTE: `onSnapshot` is more complex due to its callback nature.
    // A simple promise-based instrumenter doesn't fit well.
    // For `onSnapshot`, a dedicated wrapper (like your original `loggedOnSnapshot`) is still the most practical approach
    // if you need to log each data emission or the unsubscribe event.
    // This proxy focuses on promise-based, request/response style functions.
};

/**
 * An ES6 Proxy that wraps the entire 'firebase/firestore' module.
 * It intercepts function calls, wrapping them with our Datadog instrumentation
 * logic before executing the original function.
 */
const instrumentedFirestore = new Proxy(firestore, {
    get(target, propKey, receiver) {
        const originalProp = Reflect.get(target, propKey, receiver);
        const propName = String(propKey);

        // Check if the property being accessed is a function we want to instrument.
        if (typeof originalProp === 'function' && functionsToInstrument[propName]) {
            // If it is, return a new function that wraps the original.
            return function (...args: any[]) {
                // 1. Get the operation name and context using the mapping.
                const { operationName, context } = functionsToInstrument[propName](...args);
                
                // 2. Execute the original Firestore function.
                const promise = originalProp.apply(this, args);

                // 3. Wrap the resulting promise with our generic instrumenter.
                return instrumentCall(operationName, promise, context);
            };
        }

        // For any property that is not in our instrumentation map, return it as-is.
        return originalProp;
    },
});

// Export the proxied module's members.
// This allows other files to import { addDoc, getDocs } from this file
// and receive the instrumented versions transparently.
export const {
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    collection,
    doc,
    onSnapshot,
    // ...
} = instrumentedFirestore;
