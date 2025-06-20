import { DdLogs } from '@datadog/mobile-react-native';
import {
    addDoc,
    collection,
    CollectionReference,
    DocumentData,
    doc,
    DocumentReference,
    updateDoc,
    deleteDoc,
    onSnapshot,
    Query,
    QuerySnapshot,
    Unsubscribe,
    SnapshotOptions,
    getDocs,
    FirestoreError
} from 'firebase/firestore';

// Utility function to clean up attributes, removing null or undefined values
function cleanAttributes(attributes: Record<string, any>): Record<string, any> {
    const cleaned: Record<string, any> = {};
    for (const key in attributes) {
        if (Object.prototype.hasOwnProperty.call(attributes, key)) {
            const value = attributes[key];
            // Only include values that are not null or undefined
            // and explicitly handle the 'status' reserved key
            if (value !== null && value !== undefined && key !== 'status') {
                if (typeof value === 'object' && !Array.isArray(value)) {
                    try {
                        cleaned[key] = JSON.stringify(value);
                    } catch (e: any) { // Type e as any
                        cleaned[key] = `[Object unable to stringify: ${e.message}]`;
                    }
                } else {
                    cleaned[key] = value;
                }
            }
        }
    }
    return cleaned;
}


/**
 * Generic function to instrument any async Firebase SDK call with Datadog Logs.
 */
async function instrumentFirebaseCall<T>(
    operationName: string,
    callPromise: Promise<T>,
    payload: any = null,
    tags: Record<string, any> = {}
): Promise<T> {
    const startTime = performance.now();
    const uniqueId = Math.random().toString(36).substring(2, 10);

    const commonAttrs = {
        callId: uniqueId,
        firebaseOperation: operationName,
        logType: 'firebase_request',
    };

    const payloadAttr = payload !== null && payload !== undefined ? JSON.stringify(payload) : undefined; // More robust check for payload

    const cleanedTags = cleanAttributes(tags);

    DdLogs.info(`${operationName} - Initiated`, {
        ...commonAttrs,
        ...cleanedTags,
        payload: payloadAttr,
        callStatus: 'initiated'
    });

    try {
        const result = await callPromise;
        const duration = performance.now() - startTime;

        DdLogs.info(`${operationName} - Success`, {
            ...commonAttrs,
            ...cleanedTags,
            durationMs: duration,
            callStatus: 'success',
            // response: result ? JSON.stringify(result) : null,
        });
        return result;
    } catch (error: any) {
        const duration = performance.now() - startTime;

        const errorContext: Record<string, any> = {
            ...commonAttrs,
            ...cleanedTags,
            durationMs: duration,
            callStatus: 'failed',
            errorMessage: error.message,
            errorCode: (error as FirestoreError).code || 'unknown_code',
            errorStack: error.stack,
            payload: payloadAttr,
        };

        if (error instanceof Error) {
            for (const prop in error) {
                if (Object.prototype.hasOwnProperty.call(error, prop) && prop !== 'stack' && prop !== 'message') {
                    if (typeof error[prop] !== 'object' || Array.isArray(error[prop])) {
                        errorContext[`error_${prop}`] = error[prop];
                    } else {
                        try {
                            errorContext[`error_${prop}`] = JSON.stringify(error[prop]);
                        } catch (e: any) { // Type e as any
                            errorContext[`error_${prop}`] = `[Object unable to stringify: ${e.message}]`;
                        }
                    }
                }
            }
        }

        DdLogs.error(`${operationName} - Failed`, errorContext);
        throw error;
    }
}

export const loggedGetDocs = async <T extends DocumentData>(
    query: Query<T>,
    customTags: Record<string, any> = {}
): Promise<QuerySnapshot<T>> => {
    const collectionName = (query as any)._query?.path?.segments[0] || 'unknown';
    return instrumentFirebaseCall(
        `Firestore: Get Docs from ${collectionName}`,
        getDocs(query),
        null,
        cleanAttributes({ collectionName, ...customTags })
    );
};

export const loggedAddDoc = async (
    collectionRef: CollectionReference<DocumentData>,
    data: DocumentData,
    customTags: Record<string, any> = {}
): Promise<DocumentReference<DocumentData>> => {
    return instrumentFirebaseCall(
        `Firestore: Add Doc to ${collectionRef.id}`,
        addDoc(collectionRef, data),
        data,
        cleanAttributes({ collectionName: collectionRef.id, ...customTags })
    );
};

export const loggedUpdateDoc = async (
    docRef: DocumentReference<DocumentData>,
    data: Partial<DocumentData>,
    customTags: Record<string, any> = {}
): Promise<void> => {
    return instrumentFirebaseCall(
        `Firestore: Update Doc in ${docRef.parent.id}/${docRef.id}`,
        updateDoc(docRef, data),
        data,
        cleanAttributes({ collectionName: docRef.parent.id, docId: docRef.id, ...customTags })
    );
};

export const loggedDeleteDoc = async (
    docRef: DocumentReference<DocumentData>,
    customTags: Record<string, any> = {}
): Promise<void> => {
    return instrumentFirebaseCall(
        `Firestore: Delete Doc from ${docRef.parent.id}/${docRef.id}`,
        deleteDoc(docRef),
        null,
        cleanAttributes({ collectionName: docRef.parent.id, docId: docRef.id, ...customTags })
    );
};

export const loggedOnSnapshot = <T>(
    query: Query<T>,
    onNext: (snapshot: QuerySnapshot<T>) => void,
    onError?: (error: Error) => void,
    options?: SnapshotOptions,
    customTags: Record<string, any> = {}
): Unsubscribe => {
    const collectionName = (query as any)._query?.path?.segments[0] || 'unknown';
    const uniqueId = Math.random().toString(36).substring(2, 10);
    const cleanedCustomTags = cleanAttributes(customTags);

    DdLogs.info(`Firestore: Snapshot listener for ${collectionName} initiated`, {
        listenerId: uniqueId,
        firebaseOperation: 'onSnapshot_listener_start',
        collectionName,
        ...cleanedCustomTags
    });

    const unsubscribe = onSnapshot(
        query,
        (snapshot: any) => {
            DdLogs.info(`Firestore: Snapshot data received for ${collectionName}`, {
                listenerId: uniqueId,
                firebaseOperation: 'onSnapshot_data',
                collectionName,
                documentCount: snapshot.docs.length,
                ...cleanedCustomTags
            });
            onNext(snapshot);
        },
        (error) => {
            const errorContext: Record<string, any> = {
                listenerId: uniqueId,
                firebaseOperation: 'onSnapshot_error',
                collectionName,
                errorMessage: error.message,
                errorCode: (error as FirestoreError).code || 'unknown_code',
                errorStack: error.stack,
                ...cleanedCustomTags
            };

            if (error instanceof Error) {
                for (const prop in error) {
                    if (Object.prototype.hasOwnProperty.call(error, prop) && prop !== 'stack' && prop !== 'message') {
                        if (typeof error[prop] !== 'object' || Array.isArray(error[prop])) {
                            errorContext[`error_${prop}`] = error[prop];
                        } else {
                            try {
                                errorContext[`error_${prop}`] = JSON.stringify(error[prop]);
                            } catch (e: any) { // Type e as any
                                errorContext[`error_${prop}`] = `[Object unable to stringify: ${e.message}]`;
                            }
                        }
                    }
                }
            }
            DdLogs.error(`Firestore: Snapshot listener error for ${collectionName}`, errorContext);
            if (onError) onError(error);
        },
        options
    );

    return () => {
        unsubscribe();
        DdLogs.info(`Firestore: Snapshot listener for ${collectionName} unsubscribed`, {
            listenerId: uniqueId,
            firebaseOperation: 'onSnapshot_listener_end',
            collectionName,
            ...cleanedCustomTags
        });
    };
};