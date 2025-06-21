import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { FIREBASE_APP, FIREBASE_AUTH, FIRESTORE_DB } from './FirebaseConfig';
import {
  initializeAuth,
  getReactNativePersistence,
  signInAnonymously,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DatadogProvider,
  DatadogProviderConfiguration,
  SdkVerbosity,
} from '@datadog/mobile-react-native';
import { DdRumReactNavigationTracking } from '@datadog/mobile-react-navigation';
import { SessionReplay } from '@datadog/mobile-react-native-session-replay';

// ======================================================================
//      IMPORTANT: Import instrumented Firebase functions from your new module
// ======================================================================
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
} from './instrumentedFirebase';
// ======================================================================


// ========== DATADOG CONFIGURATION ==========
const config = new DatadogProviderConfiguration(
  '',
  'local',
  '',
  true,
  true,
  true,
);
config.serviceName = 'DatadogReactNativeFirebase';
config.site = 'US1';
config.nativeCrashReportEnabled = true;
if (__DEV__) {
  config.verbosity = SdkVerbosity.DEBUG;
}
const onSDKInitialized = async () => {
    await SessionReplay.enable({ replaySampleRate: 100 });
};

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
      const snapshot = await getDocs(tasksCollectionRef);
      
      console.log('Firestore Snapshot exists:', snapshot.empty === false);
      console.log('Number of documents in snapshot:', snapshot.docs.length);

      const lista: Todo[] = snapshot.docs.map((documentSnapshot) => { // Renamed 'doc' to 'documentSnapshot'
        const data = documentSnapshot.data();
        console.log('Document ID:', documentSnapshot.id, 'Data:', data);
        return {
          id: documentSnapshot.id,
          nome: (data as any).nome, // Explicitly access 'nome' after logging full data
        };
      }) as Todo[];

      console.log('Processed list for state:', lista);
      setTarefas(lista);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(FIREBASE_AUTH);
        console.log('[Firebase] Authenticated anonymously.');
        setAuthReady(true);
      } catch (err: any) {
        console.error('[Firebase] Authentication error:', err);
      }
    };
    initAuth();
  }, []);

  useEffect(() => {
    if (authReady) {
        fetchTarefas();
    }
  }, [authReady]);

  const adicionarOuEditarTarefa = async () => {
    if (tarefa.trim() === '') return;
    
    try {
      if (editando) {
        const ref = doc(FIRESTORE_DB, 'tarefas', editando);
        await updateDoc(ref, { nome: tarefa });
        setEditando(null);
      } else {
        const tarefasRef = collection(FIRESTORE_DB, 'tarefas');
        await addDoc(tarefasRef, { nome: tarefa });
      }
      setTarefa('');
      await fetchTarefas();
    } catch (err) {
      console.error('Failed to add or edit task:', err);
    }
  };

  const excluirTarefa = async (id: string) => {
    try {
      const ref = doc(FIRESTORE_DB, 'tarefas', id);
      await deleteDoc(ref);
      await fetchTarefas();
    } catch (err) {
      console.error('Failed to delete task:', err);
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
        <SafeAreaView style={styles.container}>
          <Text style={styles.title}>Minhas Tarefas</Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Digite uma tarefa"
              value={tarefa}
              onChangeText={setTarefa}
            />
            <Button
              title={editando ? 'Salvar' : 'Adicionar'}
              onPress={adicionarOuEditarTarefa}
            />
          </View>
          
          <Button title="Atualizar Lista" onPress={fetchTarefas} />

          {authReady ? (
            <FlatList
              style={styles.list}
              data={tarefas}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.tarefaContainer}>
                  <Text style={styles.tarefaText}>{item.nome}</Text>
                  <View style={styles.botoes}>
                    <Button title="Editar" onPress={() => iniciarEdicao(item)} />
                    <Button title="Excluir" color="#E53E3E" onPress={() => excluirTarefa(item.id)} />
                  </View>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>Nenhuma tarefa encontrada.</Text>}
            />
          ) : <Text style={styles.emptyText}>Autenticando...</Text>}
        </SafeAreaView>
      </NavigationContainer>
    </DatadogProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  inputContainer: { flexDirection: 'row', marginBottom: 10 },
  input: {
    flex: 1,
    borderColor: '#ccc',
    borderWidth: 1,
    marginRight: 10,
    paddingHorizontal: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  list: {
    marginTop: 20,
  },
  tarefaContainer: {
    padding: 15,
    backgroundColor: '#fff',
    marginBottom: 10,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  tarefaText: {
    fontSize: 16,
    flex: 1,
    color: '#333',
  },
  botoes: {
    flexDirection: 'row',
    gap: 8
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
    color: '#666'
  }
});
