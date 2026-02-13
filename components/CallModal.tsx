import React, { useEffect, useRef, useState } from 'react';
import { CallSignal, UserProfile } from '../types';
import { getFirebaseServices } from '../firebase-config';
import { doc, onSnapshot, updateDoc, collection, addDoc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';

interface CallModalProps {
  call: CallSignal;
  currentUser: UserProfile;
  onClose: () => void;
}

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

const CallModal: React.FC<CallModalProps> = ({ call, currentUser, onClose }) => {
  const [pc, setPc] = useState<RTCPeerConnection | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callStatus, setCallStatus] = useState(call.status);
  
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(call.type === 'video');

  // 0 = unknown, 1 = poor, 2 = fair, 3 = good, 4 = excellent
  const [signalQuality, setSignalQuality] = useState(0); 

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const { db } = getFirebaseServices();

  useEffect(() => {
    // Sync status
    const unsub = onSnapshot(doc(db, 'calls', call.id), (snapshot) => {
        const data = snapshot.data() as CallSignal;
        if (data) {
            setCallStatus(data.status);
            if (data.status === 'ended' || data.status === 'rejected') {
                setTimeout(onClose, 2000);
            }
        }
    });
    return () => unsub();
  }, [call.id, db, onClose]);

  // Monitor Call Quality
  useEffect(() => {
    if (!pc || (callStatus !== 'connected' && callStatus !== 'answered')) return;

    const interval = setInterval(async () => {
        try {
            const stats = await pc.getStats();
            let rtt = -1;

            stats.forEach(report => {
                if (report.type === 'candidate-pair' && report.state === 'succeeded' && typeof report.currentRoundTripTime === 'number') {
                    rtt = report.currentRoundTripTime * 1000; // ms
                }
            });

            if (rtt !== -1) {
                if (rtt < 100) setSignalQuality(4);
                else if (rtt < 300) setSignalQuality(3);
                else if (rtt < 600) setSignalQuality(2);
                else setSignalQuality(1);
            }
        } catch (e) {
            console.warn("Error fetching stats", e);
        }
    }, 2000);

    return () => clearInterval(interval);
  }, [pc, callStatus]);

  const setupSources = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: call.type === 'video',
        audio: true
    });
    setLocalStream(stream);
    
    // Show local video
    if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
    }

    const newPc = new RTCPeerConnection(servers);
    
    // Add tracks
    stream.getTracks().forEach(track => {
        newPc.addTrack(track, stream);
    });

    // Listen for remote tracks
    newPc.ontrack = (event) => {
        event.streams[0].getTracks().forEach(track => {
            track.enabled = true;
        });
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = event.streams[0];
        }
    };

    setPc(newPc);
    return newPc;
  };

  const answerCall = async () => {
    const newPc = await setupSources();
    const callDoc = doc(db, 'calls', call.id);
    const offerCandidates = collection(callDoc, 'offerCandidates');
    const answerCandidates = collection(callDoc, 'answerCandidates');

    newPc.onicecandidate = (event) => {
      event.candidate && addDoc(answerCandidates, event.candidate.toJSON());
    };

    const callData = (await getDoc(callDoc)).data();
    const offerDescription = callData?.offer;

    await newPc.setRemoteDescription(new RTCSessionDescription(offerDescription));

    const answerDescription = await newPc.createAnswer();
    await newPc.setLocalDescription(answerDescription);

    const answer = {
      type: answerDescription.type,
      sdp: answerDescription.sdp,
    };

    await updateDoc(callDoc, { answer, status: 'answered' });

    onSnapshot(offerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          newPc.addIceCandidate(candidate);
        }
      });
    });
  };

  const startCall = async () => {
    // Only caller runs this
    const newPc = await setupSources();
    const callDoc = doc(db, 'calls', call.id);
    const offerCandidates = collection(callDoc, 'offerCandidates');
    const answerCandidates = collection(callDoc, 'answerCandidates');

    newPc.onicecandidate = (event) => {
      event.candidate && addDoc(offerCandidates, event.candidate.toJSON());
    };

    const offerDescription = await newPc.createOffer();
    await newPc.setLocalDescription(offerDescription);

    const offer = {
      sdp: offerDescription.sdp,
      type: offerDescription.type,
    };

    await updateDoc(callDoc, { offer });

    onSnapshot(doc(db, 'calls', call.id), (snapshot) => {
      const data = snapshot.data();
      if (!newPc.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        newPc.setRemoteDescription(answerDescription);
      }
    });

    onSnapshot(answerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          newPc.addIceCandidate(candidate);
        }
      });
    });
  };

  useEffect(() => {
    if (call.callerId === currentUser.uid && callStatus === 'offering' && !pc) {
        startCall();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call, currentUser.uid, callStatus]);

  const endCall = async () => {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (pc) {
        pc.close();
    }
    await updateDoc(doc(db, 'calls', call.id), { status: 'ended' });
    onClose();
  };

  const toggleMic = () => {
    if (localStream) {
        localStream.getAudioTracks().forEach(track => track.enabled = !micOn);
        setMicOn(!micOn);
    }
  };

  const toggleCam = () => {
    if (localStream) {
        localStream.getVideoTracks().forEach(track => track.enabled = !camOn);
        setCamOn(!camOn);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center text-white">
        {/* Signal Indicator */}
        {(callStatus === 'answered' || callStatus === 'connected') && (
            <div className="absolute top-4 left-4 z-20 flex items-center bg-gray-900/60 backdrop-blur rounded-lg px-3 py-1.5 border border-gray-700/50 shadow-sm">
                 <div className="flex items-end space-x-1 h-3.5 mr-2">
                    {[1, 2, 3, 4].map(bar => (
                        <div 
                            key={bar} 
                            className={`w-1 rounded-sm transition-all duration-300 ${bar <= signalQuality ? (signalQuality > 2 ? 'bg-green-400' : signalQuality === 2 ? 'bg-yellow-400' : 'bg-red-400') : 'bg-gray-600/50'}`}
                            style={{ height: `${25 * bar}%` }}
                        />
                    ))}
                 </div>
                 <span className="text-[10px] font-medium text-gray-300 uppercase tracking-wider">
                     {signalQuality === 0 ? 'Wait' : signalQuality >= 3 ? 'Good' : signalQuality === 2 ? 'Fair' : 'Poor'}
                 </span>
            </div>
        )}

        <div className="relative w-full max-w-4xl flex-1 flex items-center justify-center p-4">
            {/* Remote Video */}
            {call.type === 'video' ? (
                <video 
                    ref={remoteVideoRef} 
                    autoPlay 
                    playsInline 
                    className="w-full h-full object-contain bg-black rounded-lg"
                />
            ) : (
                <div className="flex flex-col items-center animate-pulse">
                    <div className="w-32 h-32 rounded-full bg-blue-600 flex items-center justify-center text-4xl font-bold shadow-2xl">
                        {call.callerName[0]}
                    </div>
                    <h2 className="text-3xl mt-4 font-semibold">{call.callerName}</h2>
                    <p className="text-gray-400 mt-2 capitalize">{callStatus}...</p>
                </div>
            )}
            
            {/* Local Video Picture-in-Picture */}
            {call.type === 'video' && (
                <div className="absolute top-4 right-4 w-32 md:w-48 aspect-video bg-gray-900 rounded-lg overflow-hidden border border-gray-700 shadow-xl z-10">
                    <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                </div>
            )}
        </div>

        {/* Controls */}
        <div className="h-24 w-full bg-gray-900/80 backdrop-blur flex items-center justify-center space-x-6 pb-4">
            {callStatus === 'offering' && call.calleeId === currentUser.uid ? (
                <>
                    <button onClick={answerCall} className="bg-green-600 p-4 rounded-full hover:bg-green-500 animate-bounce transition-all shadow-lg shadow-green-600/20">
                        <Phone size={32} />
                    </button>
                    <button onClick={endCall} className="bg-red-600 p-4 rounded-full hover:bg-red-500 transition-all shadow-lg shadow-red-600/20">
                        <PhoneOff size={32} />
                    </button>
                </>
            ) : (
                <>
                     <button onClick={toggleMic} className={`p-4 rounded-full transition-all ${micOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20'}`}>
                        {micOn ? <Mic size={24} /> : <MicOff size={24} />}
                    </button>
                    {call.type === 'video' && (
                        <button onClick={toggleCam} className={`p-4 rounded-full transition-all ${camOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20'}`}>
                             {camOn ? <Video size={24} /> : <VideoOff size={24} />}
                        </button>
                    )}
                    <button onClick={endCall} className="bg-red-600 p-4 rounded-full hover:bg-red-500 transition-all shadow-lg shadow-red-600/20">
                        <PhoneOff size={32} />
                    </button>
                </>
            )}
        </div>
    </div>
  );
};

export default CallModal;