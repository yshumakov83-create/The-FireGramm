import React, { useState, useEffect, useRef } from 'react';
import { Chat, Message, UserProfile } from '../types';
import { getFirebaseServices } from '../firebase-config';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Send, Smile, Paperclip, Phone, Video, Loader, Image as ImageIcon } from 'lucide-react';

interface ChatWindowProps {
  chatId: string;
  recipient: UserProfile;
  currentUser: UserProfile;
  onStartCall: (type: 'audio' | 'video') => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ chatId, recipient, currentUser, onStartCall }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showStickers, setShowStickers] = useState(false);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { db, storage } = getFirebaseServices();

  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<any>(null);

  // Subscribe to messages
  useEffect(() => {
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Message));
      setMessages(msgs);
      scrollToBottom();
    });

    return () => unsubscribe();
  }, [chatId, db]);

  // Handle typing indicator
  useEffect(() => {
    // Listen for recipient typing
    const unsubscribe = onSnapshot(doc(db, 'chats', chatId), (docSnap) => {
        const data = docSnap.data();
        if (data?.typing && data.typing[recipient.uid]) {
            const typingTime = data.typing[recipient.uid].toMillis();
            if (Date.now() - typingTime < 3000) {
                // Showing typing indicator logic could go here
            }
        }
    });
    return () => unsubscribe();
  }, [chatId, recipient.uid, db]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim()) return;

    const text = newMessage;
    setNewMessage('');

    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      text,
      senderId: currentUser.uid,
      timestamp: serverTimestamp(),
      type: 'text'
    });

    await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: {
            text,
            senderId: currentUser.uid,
            timestamp: serverTimestamp(),
            type: 'text'
        }
    });
  };

  const handleTyping = () => {
    // Update typing status in Firestore
    const typingRef = doc(db, 'chats', chatId);
    updateDoc(typingRef, {
        [`typing.${currentUser.uid}`]: serverTimestamp()
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    // Logic to clear typing status typically done via cloud function or ttl, 
    // for MVP we just update timestamp.
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        setUploading(true);
        try {
            const storageRef = ref(storage, `stickers/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);

            // Send as sticker/image
            await addDoc(collection(db, 'chats', chatId, 'messages'), {
                senderId: currentUser.uid,
                timestamp: serverTimestamp(),
                type: 'sticker',
                stickerUrl: url
            });
            setShowStickers(false);
        } catch (error) {
            console.error("Upload failed", error);
        } finally {
            setUploading(false);
        }
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0f172a] relative">
      {/* Header */}
      <div className="h-16 border-b border-gray-700 flex justify-between items-center px-6 bg-[#17212b]">
        <div className="flex items-center">
            <img src={recipient.photoURL} className="w-10 h-10 rounded-full mr-3" alt="User" />
            <div>
                <h3 className="font-bold">{recipient.displayName}</h3>
                <span className="text-xs text-gray-400">Online</span>
            </div>
        </div>
        <div className="flex space-x-4 text-gray-400">
            <button onClick={() => onStartCall('audio')} className="hover:text-blue-400 transition"><Phone size={24}/></button>
            <button onClick={() => onStartCall('video')} className="hover:text-blue-400 transition"><Video size={24}/></button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-opacity-50 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
        {messages.map((msg) => {
            const isMe = msg.senderId === currentUser.uid;
            return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${isMe ? 'bg-[#3b82f6] text-white rounded-br-none' : 'bg-[#334155] text-gray-100 rounded-bl-none'}`}>
                        {msg.type === 'text' ? (
                            <p>{msg.text}</p>
                        ) : (
                            <img src={msg.stickerUrl} alt="Sticker" className="w-32 h-32 object-contain rounded-lg" />
                        )}
                        <span className="text-[10px] opacity-70 block text-right mt-1">
                            {msg.timestamp ? new Date(msg.timestamp.toMillis()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '...'}
                        </span>
                    </div>
                </div>
            );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Sticker Panel */}
      {showStickers && (
          <div className="absolute bottom-20 left-4 bg-gray-800 border border-gray-700 p-4 rounded-xl shadow-2xl w-64 z-10">
              <h4 className="text-sm font-bold mb-2 text-gray-300">Send Sticker</h4>
              <div className="grid grid-cols-4 gap-2 mb-4">
                  {/* Preset stickers (just emojis for MVP or simple images) */}
                  <button onClick={() => { /* Send preset logic */ }} className="text-2xl hover:bg-gray-700 p-1 rounded">👻</button>
                  <button className="text-2xl hover:bg-gray-700 p-1 rounded">👽</button>
                  <button className="text-2xl hover:bg-gray-700 p-1 rounded">🤖</button>
                  <button className="text-2xl hover:bg-gray-700 p-1 rounded">💩</button>
              </div>
              <div className="border-t border-gray-700 pt-2">
                  <label className="flex items-center justify-center space-x-2 text-xs text-blue-400 cursor-pointer hover:text-blue-300">
                    {uploading ? <Loader className="animate-spin" size={16} /> : <ImageIcon size={16} />}
                    <span>Upload Custom Sticker</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                  </label>
              </div>
          </div>
      )}

      {/* Input Area */}
      <div className="p-4 bg-[#17212b] border-t border-gray-700">
        <form onSubmit={handleSendMessage} className="flex items-center space-x-3">
            <button 
                type="button" 
                onClick={() => setShowStickers(!showStickers)}
                className="text-gray-400 hover:text-yellow-400 transition"
            >
                <Smile size={24} />
            </button>
            <input
                type="text"
                value={newMessage}
                onChange={(e) => {
                    setNewMessage(e.target.value);
                    handleTyping();
                }}
                placeholder="Message..."
                className="flex-1 bg-[#0f172a] text-white border border-transparent focus:border-blue-500 rounded-full py-2 px-4 focus:outline-none"
            />
            <button type="submit" className="text-blue-500 hover:text-blue-400 transition">
                <Send size={24} />
            </button>
        </form>
      </div>
    </div>
  );
};

export default ChatWindow;