import React, { useState, useEffect } from 'react';
import Auth from './components/Auth';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import CallModal from './components/CallModal';
import { getFirebaseServices } from './firebase-config';
import { onAuthStateChanged } from 'firebase/auth';
import { UserProfile, CallSignal } from './types';
import { doc, getDoc, onSnapshot, query, collection, where, addDoc } from 'firebase/firestore';

function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedRecipient, setSelectedRecipient] = useState<UserProfile | null>(null);
  const [activeCall, setActiveCall] = useState<CallSignal | null>(null);

  // Auth Listener
  useEffect(() => {
    const { auth, db } = getFirebaseServices();
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch extended profile
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          setUser(userDoc.data() as UserProfile);
        }
        
        // Listen for incoming calls
        const q = query(collection(db, 'calls'), where('calleeId', '==', firebaseUser.uid), where('status', '==', 'offering'));
        const callUnsub = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const callData = change.doc.data() as CallSignal;
                    setActiveCall({ ...callData, id: change.doc.id });
                }
            });
        });

        return () => callUnsub();

      } else {
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleStartCall = async (type: 'audio' | 'video') => {
    if (!user || !selectedRecipient) return;

    const { db } = getFirebaseServices();
    const callDocRef = await addDoc(collection(db, 'calls'), {
        callerId: user.uid,
        callerName: user.displayName,
        calleeId: selectedRecipient.uid,
        type,
        status: 'offering',
    });

    setActiveCall({
        id: callDocRef.id,
        callerId: user.uid,
        callerName: user.displayName,
        calleeId: selectedRecipient.uid,
        type,
        status: 'offering'
    });
  };

  if (!user) {
    return <Auth />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-900 text-white font-sans">
      
      {/* Sidebar - Always visible on desktop, hidden on mobile if chat selected */}
      <div className={`${selectedChatId ? 'hidden md:flex' : 'flex'} w-full md:w-1/3`}>
        <Sidebar 
            currentUser={user} 
            activeChatId={selectedChatId}
            onSelectChat={(id, recipient) => {
                setSelectedChatId(id);
                setSelectedRecipient(recipient);
            }} 
        />
      </div>

      {/* Chat Window */}
      {selectedChatId && selectedRecipient ? (
        <div className="flex-1 flex flex-col w-full md:w-2/3">
             <div className="md:hidden p-2 bg-[#17212b] border-b border-gray-700">
                <button onClick={() => setSelectedChatId(null)} className="text-blue-400 text-sm">
                    &larr; Back to chats
                </button>
             </div>
             <ChatWindow 
                chatId={selectedChatId} 
                recipient={selectedRecipient} 
                currentUser={user}
                onStartCall={handleStartCall}
             />
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-[#0f172a] text-gray-500">
            <div className="text-center">
                <p className="text-xl font-medium mb-2">Select a chat to start messaging</p>
                <div className="inline-block bg-gray-800 rounded-full px-4 py-1 text-sm">FireGram Web</div>
            </div>
        </div>
      )}

      {/* Call Overlay */}
      {activeCall && (
        <CallModal 
            call={activeCall} 
            currentUser={user} 
            onClose={() => setActiveCall(null)} 
        />
      )}
    </div>
  );
}

export default App;