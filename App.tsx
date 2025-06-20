import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  StyleSheet,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { FIREBASE_APP, FIRESTORE_DB } from './FirebaseConfig';
import {
  collection,
  // Removed direct Firebase imports as they are now wrapped
  // QuerySnapshot, // Kept for type if needed elsewhere
  doc, // Keep doc for creating DocumentReference for update/delete
} from 'firebase/firestore';

import {
  initializeAuth,
  getReactNativePersistence,
  signInAnonymously,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  BatchSize,
  DatadogProvider,
  DatadogProviderConfiguration,
  SdkVerbosity,
  UploadFrequency,
} from '@datadog/mobile-react-native';
import { DdRumReactNavigationTracking } from '@datadog/mobile-react-navigation';
import {
  ImagePrivacyLevel,
  SessionReplay,
  TextAndInputPrivacyLevel,
  TouchPrivacyLevel,
} from '@datadog/mobile-react-native-session-replay';

// IMPORT YOUR CUSTOM LOGGED FIREBASE FUNCTIONS
import {
  loggedAddDoc,
  loggedDeleteDoc,
  loggedUpdateDoc,
  loggedGetDocs, // Added loggedGetDocs
} from './utils/firebaseLogger'; // Adjust path if necessary

// ========== DATADOG CONFIGURATION ==========
const config = new DatadogProviderConfiguration(
  "",
  "local",
  "",
  true, // track User interactions
  true, // track XHR Resources
  true // track Errors
);

const onSDKInitialized = async () => {
  await SessionReplay.enable({
    replaySampleRate: 100,
    textAndInputPrivacyLevel: TextAndInputPrivacyLevel.MASK_SENSITIVE_INPUTS,
    imagePrivacyLevel: ImagePrivacyLevel.MASK_NONE,
    touchPrivacyLevel: TouchPrivacyLevel.SHOW,
  });
};

config.serviceName = 'DatadogReactNativeFirebase';
config.site = 'US1';
config.nativeCrashReportEnabled = true;
config.sessionSamplingRate = 100;
config.longTaskThresholdMs = 100;

if (__DEV__) {
  config.uploadFrequency = UploadFrequency.FREQUENT;
  config.batchSize = BatchSize.SMALL;
  config.verbosity = SdkVerbosity.DEBUG;
}

interface Todo {
  id: string;
  nome: string;
}

export default function App() {
  const navigationRef = useRef(null);
  const [tarefa, setTarefa] = useState('');
  const [tarefas, setTarefas] = useState<Todo[]>([]);
  const [editando, setEditando] = useState<string | null>(null);

  const [authReady, setAuthReady] = useState(false);

  const fetchTarefas = async () => {
    try {
      const tasksCollectionRef = collection(FIRESTORE_DB, 'tarefas');
      // Use loggedGetDocs directly
      const snapshot = await loggedGetDocs(tasksCollectionRef, { source: 'initialFetch' });
      const lista: Todo[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Todo[];
      setTarefas(lista);
    } catch (err) {
      // Error logging handled by instrumentFirebaseCall within loggedGetDocs
      // Consider adding a console.error here for immediate dev feedback if needed
    }
  };

  useEffect(() => {
    // REMOVED DUPLICATE SessionReplay.enable call
    // SessionReplay.enable({ replaySampleRate: 100 }); // This line must be removed

    const initAuth = async () => {
      const auth = initializeAuth(FIREBASE_APP, {
        persistence: getReactNativePersistence(AsyncStorage),
      });

      try {
        await signInAnonymously(auth);
        console.log('[Firebase] Autenticado anonimamente.');
        setAuthReady(true);
        fetchTarefas();
      } catch (err: any) {
        console.error('[Firebase] Erro na autenticação:', err);
      }
    };

    initAuth();
  }, []);

  const adicionarOuEditarTarefa = async () => {
    if (tarefa.trim() === '') return;
    const tarefasRef = collection(FIRESTORE_DB, 'tarefas');

    try {
      if (editando) {
        const ref = doc(FIRESTORE_DB, 'tarefas', editando);
        await loggedUpdateDoc(ref, { nome: tarefa }, { taskId: editando, action: 'edit' });
        setEditando(null);
      } else {
        await loggedAddDoc(tarefasRef, { nome: tarefa }, { action: 'add' });
      }
      setTarefa('');
      fetchTarefas();
    } catch (err) {
      // Error logging handled by instrumentFirebaseCall
      // Consider adding a console.error here for immediate dev feedback if needed
    }
  };

  const excluirTarefa = async (id: string) => {
    try {
      const ref = doc(FIRESTORE_DB, 'tarefas', id);
      await loggedDeleteDoc(ref, { taskId: id, action: 'delete' });
      fetchTarefas();
    } catch (err) {
      // Error logging handled by instrumentFirebaseCall
      // Consider adding a console.error here for immediate dev feedback if needed
    }
  };

  const iniciarEdicao = (item: Todo) => {
    setTarefa(item.nome);
    setEditando(item.id);
  };

  return (
    <DatadogProvider configuration={config} onInitialization={onSDKInitialized}>
      <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          DdRumReactNavigationTracking.startTrackingViews(navigationRef.current);
        }}
      >
        <View style={styles.container}>
          <Text style={styles.title}>Minhas Tarefas</Text>

          <TextInput
            style={styles.input}
            placeholder="Digite uma tarefa"
            value={tarefa}
            onChangeText={setTarefa}
          />

          <Button
            title={editando ? 'Salvar edição' : 'Adicionar'}
            onPress={adicionarOuEditarTarefa}
          />
          <Button title="Atualizar" onPress={fetchTarefas} />

          {authReady && (
            <FlatList
              data={tarefas}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.tarefa}>
                  <Text>{item.nome}</Text>
                  <View style={styles.botoes}>
                    <Button title="Editar" onPress={() => iniciarEdicao(item)} />
                    <Button title="Excluir" color="red" onPress={() => excluirTarefa(item.id)} />
                  </View>
                </View>
              )}
            />
          )}
        </View>
      </NavigationContainer>
    </DatadogProvider>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, flex: 1 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  input: {
    borderColor: '#ccc',
    borderWidth: 1,
    marginBottom: 10,
    padding: 10,
    borderRadius: 5,
  },
  tarefa: {
    padding: 10,
    backgroundColor: '#eee',
    marginBottom: 10,
    borderRadius: 5,
  },
  botoes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
});