import React, { useState, useEffect } from 'react';
import { UserProfile, Chat } from '../types';
import { getFirebaseServices } from '../firebase-config';
import { collection, query, where, getDocs, onSnapshot, doc, updateDoc, arrayUnion, addDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { LogOut, UserPlus, Search, Video, Phone } from 'lucide-react';
import { signOut } from 'firebase/auth';

interface SidebarProps {
  currentUser: UserProfile;
  onSelectChat: (chatId: string, user: UserProfile) => void;
  activeChatId: string | null;
}

const Sidebar: React.FC<SidebarProps> = ({ currentUser, onSelectChat, activeChatId }) => {
  const [contacts, setContacts] = useState<UserProfile[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { db, auth } = getFirebaseServices();

  // Load Contacts
  useEffect(() => {
    if (!currentUser.contacts || currentUser.contacts.length === 0) return;

    // In a real app with many contacts, you'd paginate or fetch individually.
    // Firestore "in" query limits to 10. For MVP, we'll fetch individually or use simple query.
    // For simplicity, let's just fetch all users that are in the contacts list.
    
    // Better MVP approach: Fetch all users, filter client side (Not scalable, but works for MVP)
    // Or fetch by ID.
    
    const fetchContacts = async () => {
      const contactsData: UserProfile[] = [];
      for (const uid of currentUser.contacts!) {
         const userDoc = await getDocs(query(collection(db, 'users'), where('uid', '==', uid)));
         if (!userDoc.empty) {
           contactsData.push(userDoc.docs[0].data() as UserProfile);
         }
      }
      setContacts(contactsData);
    };

    fetchContacts();
  }, [currentUser.contacts, db]);

  const handleAddContact = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'users'), where('email', '==', addEmail));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        alert('User not found!');
        setLoading(false);
        return;
      }

      const foundUser = querySnapshot.docs[0].data() as UserProfile;
      
      if (foundUser.uid === currentUser.uid) {
        alert("You can't add yourself.");
        setLoading(false);
        return;
      }

      // Add to current user's contacts
      const currentUserRef = doc(db, 'users', currentUser.uid);
      await updateDoc(currentUserRef, {
        contacts: arrayUnion(foundUser.uid)
      });
      
      // Also add current user to their contacts (mutual for MVP simplicity)
      const otherUserRef = doc(db, 'users', foundUser.uid);
      await updateDoc(otherUserRef, {
        contacts: arrayUnion(currentUser.uid)
      });

      setAddEmail('');
      setShowAddModal(false);
      // Determine if a chat already exists, if not create one
      // We do this lazily when clicking the contact, or here.
      
    } catch (e) {
      console.error(e);
      alert('Error adding contact');
    } finally {
      setLoading(false);
    }
  };

  const handleContactClick = async (contact: UserProfile) => {
    // Check for existing chat
    // Query chats where participants include both IDs
    // Firestore array-contains only allows one value.
    // Standard pattern: Store chat ID in a subcollection or deterministic ID.
    
    // Deterministic ID: sort uids, join with "_"
    const chatId = [currentUser.uid, contact.uid].sort().join('_');
    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDocs(query(collection(db, 'chats'), where('__name__', '==', chatId)));

    if (chatSnap.empty) {
      await setDoc(doc(db, 'chats', chatId), {
        id: chatId,
        participants: [currentUser.uid, contact.uid],
        createdAt: serverTimestamp(),
        lastMessage: null
      });
    }

    onSelectChat(chatId, contact);
  };

  return (
    <div className="w-full md:w-1/3 bg-[#1e293b] flex flex-col border-r border-gray-700 h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-[#17212b]">
        <div className="flex items-center space-x-3">
            <img src={currentUser.photoURL} alt="Me" className="w-10 h-10 rounded-full" />
            <div>
                <h3 className="font-semibold">{currentUser.displayName}</h3>
                <span className="text-xs text-green-400">Online</span>
            </div>
        </div>
        <div className="flex space-x-2">
            <button onClick={() => setShowAddModal(true)} className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white">
                <UserPlus size={20} />
            </button>
            <button onClick={() => signOut(auth)} className="p-2 hover:bg-gray-700 rounded-full text-red-400 hover:text-red-300">
                <LogOut size={20} />
            </button>
        </div>
      </div>

      {/* Search (Visual only for MVP) */}
      <div className="p-4">
        <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-500" size={18} />
            <input 
                type="text" 
                placeholder="Search" 
                className="w-full bg-[#0f172a] text-gray-200 pl-10 pr-4 py-2 rounded-full focus:outline-none border border-transparent focus:border-blue-500 transition" 
            />
        </div>
      </div>

      {/* Contacts List */}
      <div className="flex-1 overflow-y-auto">
        {contacts.map(contact => (
            <div 
                key={contact.uid}
                onClick={() => handleContactClick(contact)}
                className={`flex items-center p-3 cursor-pointer transition hover:bg-[#2b5278]/30 ${activeChatId?.includes(contact.uid) ? 'bg-[#2b5278]/50' : ''}`}
            >
                <img src={contact.photoURL} alt={contact.displayName} className="w-12 h-12 rounded-full mr-3" />
                <div className="flex-1">
                    <h4 className="font-medium text-gray-100">{contact.displayName}</h4>
                    <p className="text-sm text-gray-400 truncate">{contact.email}</p>
                </div>
            </div>
        ))}
        {contacts.length === 0 && (
            <div className="text-center text-gray-500 mt-10 p-4">
                No contacts yet. <br/> Click the + icon to add someone by email.
            </div>
        )}
      </div>

      {/* Add Contact Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 p-6 rounded-lg w-full max-w-sm border border-gray-700">
                <h3 className="text-xl font-bold mb-4">Add Contact</h3>
                <input 
                    type="email" 
                    placeholder="User Email" 
                    className="w-full bg-gray-900 border border-gray-600 rounded p-2 mb-4 text-white focus:border-blue-500 outline-none"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                />
                <div className="flex justify-end space-x-2">
                    <button 
                        onClick={() => setShowAddModal(false)}
                        className="px-4 py-2 text-gray-400 hover:text-white"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleAddContact}
                        disabled={loading}
                        className="px-4 py-2 bg-blue-600 rounded text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        {loading ? 'Adding...' : 'Add'}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;