import { DdLogs } from '@datadog/mobile-react-native';
import { FirestoreError } from 'firebase/firestore';

// Utility function to clean up attributes, removing null or undefined values.
// This is important to avoid sending empty attributes to Datadog.
function cleanAttributes(attributes: Record<string, any>): Record<string, any> {
    const cleaned: Record<string, any> = {};
    for (const key in attributes) {
        if (Object.prototype.hasOwnProperty.call(attributes, key)) {
            const value = attributes[key];
            if (value !== null && value !== undefined) {
                if (typeof value === 'object' && !Array.isArray(value)) {
                    try {
                        cleaned[key] = JSON.stringify(value);
                    } catch (e: any) {
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
 * A generic, reusable function to instrument any asynchronous operation with Datadog logging.
 * It logs the initiation, success, or failure of the promise, capturing duration and context.
 *
 * @param operationName A descriptive name for the operation being instrumented (e.g., 'Firestore: getDocs').
 * @param callPromise The async function (as a promise) to execute and monitor.
 * @param context An object containing relevant data for logging, like payload and custom tags.
 * @returns The result of the original `callPromise`.
 */
export async function instrumentCall<T>(
    operationName: string,
    callPromise: Promise<T>,
    context: { payload?: any; tags?: Record<string, any> } = {}
): Promise<T> {
    const startTime = performance.now();
    // Unique ID to correlate start and end logs for a single operation.
    const callId = Math.random().toString(36).substring(2, 10);

    const commonAttrs = {
        callId: callId,
        operationName: operationName,
        logType: 'instrumented_call',
        ...cleanAttributes(context.tags || {})
    };

    DdLogs.info(`${operationName} - Initiated`, {
        ...commonAttrs,
        payload: context.payload ? JSON.stringify(context.payload) : undefined,
        callStatus: 'initiated'
    });

    try {
        const result = await callPromise;
        const duration = performance.now() - startTime;

        DdLogs.info(`${operationName} - Success`, {
            ...commonAttrs,
            durationMs: duration,
            callStatus: 'success',
        });

        return result;
    } catch (error: any) {
        const duration = performance.now() - startTime;

        const errorContext: Record<string, any> = {
            ...commonAttrs,
            durationMs: duration,
            callStatus: 'failed',
            errorMessage: error.message,
            errorCode: (error as FirestoreError).code || 'unknown_code',
            errorStack: error.stack,
            payload: context.payload ? JSON.stringify(context.payload) : undefined,
        };
        
        if (error instanceof Error) {
            for (const prop in error) {
                if (Object.prototype.hasOwnProperty.call(error, prop) && prop !== 'stack' && prop !== 'message') {
                    errorContext[`error_${prop}`] = error[prop];
                }
            }
        }

        DdLogs.error(`${operationName} - Failed`, errorContext);
        // Re-throw the error to ensure the application's error handling logic still runs.
        throw error;
    }
}
