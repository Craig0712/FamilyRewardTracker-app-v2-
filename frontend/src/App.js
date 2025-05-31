import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, collection, addDoc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, onSnapshot, query, where, Timestamp, writeBatch } from 'firebase/firestore';
import { UserPlus, Trash2, Gift, Settings, Award, PlusCircle, ChevronDown, ChevronUp, ListChecks, History, FileText, Download } from 'lucide-react';

// Firebase 配置 
// eslint-disable-next-line no-undef
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  apiKey: "AIzaSyBCWDtP45aGKX3oWWDJDvgZUY1Pmdy9c2g",
  authDomain: "familyrewardtracker.firebaseapp.com",
  projectId: "familyrewardtracker",
  storageBucket: "familyrewardtracker.firebasestorage.app",
  messagingSenderId: "161589639146",
  appId: "1:161589639146:web:4b92fe0f188bed8a84e493",
  measurementId: "G-RP5VHEKFQ1"
};

// 全局變量
// eslint-disable-next-line no-undef
const globalAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 主應用程式組件
function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [members, setMembers] = useState([]);
  const [newMemberName, setNewMemberName] = useState('');

  const [pointsInput, setPointsInput] = useState('');
  const [selectedMemberIdForPoints, setSelectedMemberIdForPoints] = useState('');
  const [pointsDate, setPointsDate] = useState(new Date().toISOString().split('T')[0]);
  const [pointsNotes, setPointsNotes] = useState('');

  const [appSettings, setAppSettings] = useState({ pointsToReward: 100 });
  const [newPointsToReward, setNewPointsToReward] = useState(100);

  const [notification, setNotification] = useState({ message: '', type: '' }); // type: 'success' or 'error'
  const [isLoading, setIsLoading] = useState(false);

  const [expandedMemberId, setExpandedMemberId] = useState(null); // For point history
  const [expandedRewardHistoryMemberId, setExpandedRewardHistoryMemberId] = useState(null); // For reward history

  const [memberPointHistory, setMemberPointHistory] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const [memberRewardHistory, setMemberRewardHistory] = useState([]);
  const [isRewardHistoryLoading, setIsRewardHistoryLoading] = useState(false);

  const [isRedeemModalOpen, setIsRedeemModalOpen] = useState(false);
  const [memberToRedeem, setMemberToRedeem] = useState(null);
  const [rewardDescriptionInput, setRewardDescriptionInput] = useState('');
  
  // Firebase 路徑
  const getMembersCollectionPath = useCallback(() => `/artifacts/${globalAppId}/users/${currentUserId}/familyMembers`, [currentUserId]);
  const getPointsLogCollectionPath = useCallback(() => `/artifacts/${globalAppId}/users/${currentUserId}/pointsLog`, [currentUserId]);
  const getRewardLogCollectionPath = useCallback(() => `/artifacts/${globalAppId}/users/${currentUserId}/rewardLog`, [currentUserId]);
  const getSettingsDocPath = useCallback(() => `/artifacts/${globalAppId}/users/${currentUserId}/appSettings/config`, [currentUserId]);


  // 認証狀態監聽
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setCurrentUserId(user.uid);
        //setIsAuthReady(true); //延後到路徑建立後
      } else {
        // eslint-disable-next-line no-undef
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            // eslint-disable-next-line no-undef
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (error) {
            console.error("Custom token sign-in error:", error);
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // 確保 currentUserId 有效後才設定 isAuthReady
  useEffect(() => {
    if (currentUserId) {
        setIsAuthReady(true);
    }
  }, [currentUserId]);


  // 顯示通知
  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: '', type: '' }), 3000);
  };

  // 獲取設定
  useEffect(() => {
    if (!isAuthReady || !currentUserId) return;
    const settingsRef = doc(db, getSettingsDocPath());
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setAppSettings(data);
        setNewPointsToReward(data.pointsToReward);
      } else {
        setDoc(settingsRef, { pointsToReward: 100 })
          .then(() => console.log("Default settings created."))
          .catch(error => console.error("Error creating default settings:", error));
      }
    }, (error) => {
      console.error("Error fetching settings: ", error);
      showNotification("讀取設定失敗", "error");
    });
    return () => unsubscribe();
  }, [isAuthReady, currentUserId, getSettingsDocPath]);

  // 獲取成員列表
  useEffect(() => {
    if (!isAuthReady || !currentUserId) return;
    const membersRef = collection(db, getMembersCollectionPath());
    const q = query(membersRef);
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const membersList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      membersList.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setMembers(membersList);
      if (membersList.length > 0 && !selectedMemberIdForPoints) {
        setSelectedMemberIdForPoints(membersList[0].id);
      }
    }, (error) => {
      console.error("Error fetching members: ", error);
      showNotification("讀取成員列表失敗", "error");
    });
    return () => unsubscribe();
  }, [isAuthReady, currentUserId, getMembersCollectionPath, selectedMemberIdForPoints]);


  // 新增成員
  const handleAddMember = async () => {
    if (!newMemberName.trim()) {
      showNotification("成員名稱不能為空", "error"); return;
    }
    if (!isAuthReady || !currentUserId) {
      showNotification("使用者未驗證", "error"); return;
    }
    setIsLoading(true);
    try {
      await addDoc(collection(db, getMembersCollectionPath()), {
        name: newMemberName.trim(), totalPoints: 0, rewardCount: 0, createdAt: Timestamp.now()
      });
      showNotification(`成員 "${newMemberName.trim()}" 新增成功`, "success");
      setNewMemberName('');
    } catch (error) {
      console.error("Error adding member: ", error);
      showNotification("新增成員失敗", "error");
    }
    setIsLoading(false);
  };

  // 刪除成員
  const handleDeleteMember = async (memberId, memberName) => {
    const confirmed = await showCustomConfirm(`確定要刪除成員 "${memberName}" 嗎？這將會刪除該成員的所有點數及獎勵紀錄。`);
    if (!confirmed) return;
    if (!isAuthReady || !currentUserId) {
      showNotification("使用者未驗證", "error"); return;
    }
    setIsLoading(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, getMembersCollectionPath(), memberId));
      
      const pointsLogQuery = query(collection(db, getPointsLogCollectionPath()), where("memberId", "==", memberId));
      const pointsLogSnapshot = await getDocs(pointsLogQuery);
      pointsLogSnapshot.forEach(doc => batch.delete(doc.ref));

      const rewardLogQuery = query(collection(db, getRewardLogCollectionPath()), where("memberId", "==", memberId));
      const rewardLogSnapshot = await getDocs(rewardLogQuery);
      rewardLogSnapshot.forEach(doc => batch.delete(doc.ref));

      await batch.commit();
      showNotification(`成員 "${memberName}" 及相關紀錄已刪除`, "success");
      if (selectedMemberIdForPoints === memberId) {
        setSelectedMemberIdForPoints(members.length > 1 ? members.find(m => m.id !== memberId)?.id || '' : '');
      }
    } catch (error) {
      console.error("Error deleting member: ", error);
      showNotification("刪除成員失敗", "error");
    }
    setIsLoading(false);
  };
  
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null });
  const showCustomConfirm = (message) => {
    return new Promise((resolve) => {
      setConfirmModal({ isOpen: true, message: message, onConfirm: (confirmed) => {
        setConfirmModal({ isOpen: false, message: '', onConfirm: null });
        resolve(confirmed);
      }});
    });
  };

  // 新增點數紀錄
  const handleAddPoints = async () => {
    if (!selectedMemberIdForPoints) { showNotification("請選擇成員", "error"); return; }
    const points = parseInt(pointsInput);
    if (isNaN(points) || points <= 0) { showNotification("請輸入有效的點數 (正整數)", "error"); return; }
    if (!pointsDate) { showNotification("請選擇日期", "error"); return; }
    if (!isAuthReady || !currentUserId) { showNotification("使用者未驗證", "error"); return; }
    setIsLoading(true);
    try {
      const memberRef = doc(db, getMembersCollectionPath(), selectedMemberIdForPoints);
      const memberDoc = await getDoc(memberRef);
      if (!memberDoc.exists()) { showNotification("選擇的成員不存在", "error"); setIsLoading(false); return; }
      const memberData = memberDoc.data();
      const newTotalPoints = (memberData.totalPoints || 0) + points;
      const batch = writeBatch(db);
      batch.set(doc(collection(db, getPointsLogCollectionPath())), {
        memberId: selectedMemberIdForPoints, memberName: memberData.name, points: points,
        date: Timestamp.fromDate(new Date(pointsDate)), notes: pointsNotes.trim(), createdAt: Timestamp.now()
      });
      batch.update(memberRef, { totalPoints: newTotalPoints });
      await batch.commit();
      showNotification(`已為 ${memberData.name} 新增 ${points} 點`, "success");
      setPointsInput(''); setPointsNotes('');
    } catch (error) {
      console.error("Error adding points: ", error); showNotification("新增點數失敗", "error");
    }
    setIsLoading(false);
  };

  // 開啟兌換獎勵 Modal
  const openRedeemModal = (member) => {
    if ((member.totalPoints || 0) < appSettings.pointsToReward) {
      showNotification(`${member.name} 的點數不足以兌換獎勵 (需要 ${appSettings.pointsToReward} 點)`, "error");
      return;
    }
    setMemberToRedeem(member);
    setRewardDescriptionInput('');
    setIsRedeemModalOpen(true);
  };

  // 確認兌換獎勵
  const handleConfirmRedeemReward = async () => {
    if (!memberToRedeem || !rewardDescriptionInput.trim()) {
      showNotification("請輸入獎勵內容", "error"); return;
    }
    if (!isAuthReady || !currentUserId) { showNotification("使用者未驗證", "error"); return; }
    setIsLoading(true);
    try {
      const memberRef = doc(db, getMembersCollectionPath(), memberToRedeem.id);
      const memberData = memberToRedeem; // Already have member data from `memberToRedeem` state

      const newTotalPoints = memberData.totalPoints - appSettings.pointsToReward;
      const newRewardCount = (memberData.rewardCount || 0) + 1;

      const batch = writeBatch(db);
      // 1. 新增獎勵兌換紀錄
      batch.set(doc(collection(db, getRewardLogCollectionPath())), {
        memberId: memberToRedeem.id,
        memberName: memberData.name,
        rewardDescription: rewardDescriptionInput.trim(),
        pointsSpent: appSettings.pointsToReward,
        redeemedAt: Timestamp.now()
      });
      // 2. 更新成員點數和獎勵次數
      batch.update(memberRef, {
        totalPoints: newTotalPoints,
        rewardCount: newRewardCount
      });
      await batch.commit();
      showNotification(`${memberData.name} 成功兌換獎勵: ${rewardDescriptionInput.trim()}`, "success");
      setIsRedeemModalOpen(false);
      setMemberToRedeem(null);
      setRewardDescriptionInput('');
    } catch (error) {
      console.error("Error redeeming reward: ", error);
      showNotification("兌換獎勵失敗", "error");
    }
    setIsLoading(false);
  };

  // 更新設定
  const handleUpdateSettings = async () => {
    const points = parseInt(newPointsToReward);
    if (isNaN(points) || points <= 0) { showNotification("請輸入有效的兌換所需點數", "error"); return; }
    if (!isAuthReady || !currentUserId) { showNotification("使用者未驗證", "error"); return; }
    setIsLoading(true);
    try {
      await setDoc(doc(db, getSettingsDocPath()), { pointsToReward: points });
      showNotification("設定更新成功", "success");
    } catch (error) {
      console.error("Error updating settings: ", error); showNotification("更新設定失敗", "error");
    }
    setIsLoading(false);
  };

  // 獲取成員點數歷史紀錄
  const fetchMemberPointHistory = useCallback(async (memberId) => {
    if (!isAuthReady || !currentUserId || !memberId) return;
    setIsHistoryLoading(true);
    try {
      const q = query(collection(db, getPointsLogCollectionPath()), where("memberId", "==", memberId));
      const querySnapshot = await getDocs(q);
      let history = querySnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
      history.sort((a, b) => b.date.toMillis() - a.date.toMillis());
      setMemberPointHistory(history);
    } catch (error) {
      console.error("Error fetching point history:", error); showNotification("讀取點數歷史失敗", "error");
    }
    setIsHistoryLoading(false);
  }, [isAuthReady, currentUserId, getPointsLogCollectionPath]);

  const toggleMemberExpansion = (memberId) => {
    if (expandedMemberId === memberId) {
      setExpandedMemberId(null); setMemberPointHistory([]);
    } else {
      setExpandedMemberId(memberId); fetchMemberPointHistory(memberId);
      setExpandedRewardHistoryMemberId(null); setMemberRewardHistory([]); // Close other history
    }
  };

  // 獲取成員獎勵歷史紀錄
  const fetchMemberRewardHistory = useCallback(async (memberId) => {
    if (!isAuthReady || !currentUserId || !memberId) return;
    setIsRewardHistoryLoading(true);
    try {
      const q = query(collection(db, getRewardLogCollectionPath()), where("memberId", "==", memberId));
      const querySnapshot = await getDocs(q);
      let history = querySnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
      history.sort((a, b) => b.redeemedAt.toMillis() - a.redeemedAt.toMillis());
      setMemberRewardHistory(history);
    } catch (error) {
      console.error("Error fetching reward history:", error); showNotification("讀取獎勵歷史失敗", "error");
    }
    setIsRewardHistoryLoading(false);
  }, [isAuthReady, currentUserId, getRewardLogCollectionPath]);

  const toggleRewardHistoryExpansion = (memberId) => {
    if (expandedRewardHistoryMemberId === memberId) {
      setExpandedRewardHistoryMemberId(null); setMemberRewardHistory([]);
    } else {
      setExpandedRewardHistoryMemberId(memberId); fetchMemberRewardHistory(memberId);
      setExpandedMemberId(null); setMemberPointHistory([]); // Close other history
    }
  };

  // 資料匯出相關函數
  const downloadFile = (filename, content, mimeType = 'text/csv;charset=utf-8;') => {
    const blob = new Blob([content], { type: mimeType });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const escapeCsvCell = (cellData) => {
    const stringData = String(cellData == null ? "" : cellData); // Handle null/undefined
    if (stringData.includes(',') || stringData.includes('"') || stringData.includes('\n')) {
      return `"${stringData.replace(/"/g, '""')}"`;
    }
    return stringData;
  };
  
  const convertToCsv = (dataArray, headers) => {
    const headerRow = headers.map(escapeCsvCell).join(',') + '\r\n';
    const contentRows = dataArray.map(row => 
      headers.map(header => escapeCsvCell(row[header.toLowerCase().replace(/\s+/g, '')] || row[header] )).join(',') // try to match common key patterns
    ).join('\r\n');
    return '\uFEFF' + headerRow + contentRows; // Add BOM for Excel UTF-8 compatibility
  };


  const exportData = async (dataType, format = 'csv') => {
    if (!isAuthReady || !currentUserId) { showNotification("使用者未驗證", "error"); return; }
    setIsLoading(true);
    let dataToExport = [];
    let headers = [];
    let filename = `${dataType}_export.${format}`;

    try {
      if (dataType === 'members') {
        headers = ['ID', '名稱', '總點數', '獎勵次數', '建立時間'];
        const membersSnapshot = await getDocs(collection(db, getMembersCollectionPath()));
        dataToExport = membersSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            名稱: data.name,
            總點數: data.totalPoints,
            獎勵次數: data.rewardCount,
            建立時間: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : ''
          };
        });
        filename = `成員列表.${format}`;
      } else if (dataType === 'pointsLog') {
        headers = ['紀錄ID', '成員ID', '成員名稱', '點數', '日期', '備註', '記錄時間'];
        const pointsLogSnapshot = await getDocs(collection(db, getPointsLogCollectionPath()));
        dataToExport = pointsLogSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            紀錄id: doc.id,
            成員id: data.memberId,
            成員名稱: data.memberName,
            點數: data.points,
            日期: data.date?.toDate ? data.date.toDate().toLocaleDateString() : '',
            備註: data.notes,
            記錄時間: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : ''
          };
        });
        filename = `點數歷史紀錄.${format}`;
      } else if (dataType === 'rewardLog') {
        headers = ['紀錄ID', '成員ID', '成員名稱', '獎勵內容', '花費點數', '兌換時間'];
        const rewardLogSnapshot = await getDocs(collection(db, getRewardLogCollectionPath()));
        dataToExport = rewardLogSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            紀錄id: doc.id,
            成員id: data.memberId,
            成員名稱: data.memberName,
            獎勵內容: data.rewardDescription,
            花費點數: data.pointsSpent,
            兌換時間: data.redeemedAt?.toDate ? data.redeemedAt.toDate().toLocaleString() : ''
          };
        });
        filename = `獎勵兌換歷史.${format}`;
      }

      if (dataToExport.length === 0) {
        showNotification("沒有可匯出的資料", "info");
        setIsLoading(false);
        return;
      }
      
      // For CSV, map data keys to header names for convertToCsv
      const mappedData = dataToExport.map(item => {
        const newItem = {};
        headers.forEach(header => {
            // Find a key in item that matches header (case-insensitive, ignore spaces)
            const keyInItem = Object.keys(item).find(k => k.toLowerCase().replace(/\s+/g, '') === header.toLowerCase().replace(/\s+/g, '')) || header;
            newItem[header] = item[keyInItem];
        });
        return newItem;
      });

      const fileContent = convertToCsv(mappedData, headers);
      downloadFile(filename, fileContent, format === 'txt' ? 'text/plain;charset=utf-8;' : 'text/csv;charset=utf-8;');
      showNotification("資料匯出成功", "success");

    } catch (error) {
      console.error(`Error exporting ${dataType}: `, error);
      showNotification("資料匯出失敗", "error");
    }
    setIsLoading(false);
  };


  if (!isAuthReady) {
    return <div className="flex justify-center items-center h-screen bg-slate-100 text-slate-700"><div>正在載入應用程式...</div></div>;
  }
  
  // UI 渲染
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 to-blue-200 p-4 sm:p-6 md:p-8 font-sans">
      <div className="container mx-auto max-w-5xl"> {/* Increased max-width for more space */}
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-sky-700">家庭點數獎勵系統</h1>
          {currentUserId && <p className="text-xs text-slate-500 mt-1">使用者ID: {currentUserId}</p>}
        </header>

        {notification.message && (
          <div className={`fixed top-5 right-5 p-4 rounded-lg shadow-lg text-white ${notification.type === 'success' ? 'bg-green-500' : notification.type === 'info' ? 'bg-blue-500' : 'bg-red-500'} z-50 transition-opacity duration-300`}>
            {notification.message}
          </div>
        )}

        {confirmModal.isOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
              <p className="text-slate-700 mb-4">{confirmModal.message}</p>
              <div className="flex justify-end space-x-3">
                <button onClick={() => confirmModal.onConfirm(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300">取消</button>
                <button onClick={() => confirmModal.onConfirm(true)} className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600">確定</button>
              </div>
            </div>
          </div>
        )}

        {isRedeemModalOpen && memberToRedeem && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
              <h3 className="text-xl font-semibold text-sky-600 mb-4">為 {memberToRedeem.name} 兌換獎勵</h3>
              <p className="text-sm text-slate-600 mb-1">將花費: {appSettings.pointsToReward} 點</p>
              <p className="text-sm text-slate-600 mb-4">剩餘點數: {memberToRedeem.totalPoints - appSettings.pointsToReward}</p>
              <div>
                <label htmlFor="rewardDescription" className="block text-sm font-medium text-slate-700 mb-1">獎勵內容說明</label>
                <textarea
                  id="rewardDescription"
                  value={rewardDescriptionInput}
                  onChange={(e) => setRewardDescriptionInput(e.target.value)}
                  placeholder="例如：看電影、買零食等"
                  rows="3"
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button onClick={() => setIsRedeemModalOpen(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300">取消</button>
                <button onClick={handleConfirmRedeemReward} disabled={isLoading || !rewardDescriptionInput.trim()} className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-slate-300">確認兌換</button>
              </div>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6"> {/* Changed to 3 columns for larger screens */}
          {/* 左側欄：成員管理 & 點數輸入 */}
          <div className="lg:col-span-1 space-y-6">
            <section className="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow">
              <h2 className="text-2xl font-semibold text-sky-600 mb-4 flex items-center"><UserPlus className="mr-2 h-6 w-6" /> 新增成員</h2>
              <div className="flex space-x-2">
                <input type="text" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} placeholder="輸入成員名稱" className="flex-grow p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"/>
                <button onClick={handleAddMember} disabled={isLoading} className="bg-sky-500 text-white px-4 py-3 rounded-lg hover:bg-sky-600 disabled:bg-slate-300"><PlusCircle className="h-5 w-5" /></button>
              </div>
            </section>

            <section className="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow">
              <h2 className="text-2xl font-semibold text-sky-600 mb-4 flex items-center"><Award className="mr-2 h-6 w-6" /> 新增點數</h2>
              <div className="space-y-4">
                <select value={selectedMemberIdForPoints} onChange={(e) => setSelectedMemberIdForPoints(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500">
                  <option value="">-- 請選擇成員 --</option>
                  {members.map(member => (<option key={member.id} value={member.id}>{member.name}</option>))}
                </select>
                <input type="number" value={pointsInput} onChange={(e) => setPointsInput(e.target.value)} placeholder="輸入點數" className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"/>
                <input type="date" value={pointsDate} onChange={(e) => setPointsDate(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"/>
                <textarea value={pointsNotes} onChange={(e) => setPointsNotes(e.target.value)} placeholder="備註 (選填)" rows="2" className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"></textarea>
                <button onClick={handleAddPoints} disabled={isLoading || !selectedMemberIdForPoints} className="w-full bg-green-500 text-white p-3 rounded-lg hover:bg-green-600 disabled:bg-slate-300 font-semibold">記錄點數</button>
              </div>
            </section>
          </div>

          {/* 中間欄：成員列表 */}
          <div className="lg:col-span-2 space-y-6"> {/* Member list takes 2 columns on large screens */}
            <section className="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow">
              <h2 className="text-2xl font-semibold text-sky-600 mb-4 flex items-center"><ListChecks className="mr-2 h-6 w-6" /> 成員點數總覽</h2>
              {members.length === 0 ? (<p className="text-slate-500">尚未新增任何成員。</p>) : (
                <ul className="space-y-4">
                  {members.map(member => (
                    <li key={member.id} className="border border-slate-200 rounded-lg p-4">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                        <div className="flex-grow mb-2 sm:mb-0">
                          <h3 className="text-xl font-medium text-slate-800">{member.name}</h3>
                          <p className="text-sm text-slate-600">總點數：<span className="font-bold text-sky-600">{member.totalPoints || 0}</span> 點</p>
                          <p className="text-sm text-slate-600">已兌換獎勵：<span className="font-bold text-green-600">{member.rewardCount || 0}</span> 次</p>
                        </div>
                        <div className="flex space-x-1 sm:space-x-2 mt-2 sm:mt-0 flex-shrink-0 flex-wrap">
                          <button onClick={() => openRedeemModal(member)} disabled={isLoading || (member.totalPoints || 0) < appSettings.pointsToReward} className="bg-yellow-400 text-yellow-900 px-3 py-1.5 rounded-md hover:bg-yellow-500 text-xs sm:text-sm disabled:bg-slate-300 disabled:text-slate-500 flex items-center mb-1 sm:mb-0" title={`兌換獎勵 (需 ${appSettings.pointsToReward} 點)`}><Gift className="mr-1 h-4 w-4" /> 兌換</button>
                          <button onClick={() => toggleMemberExpansion(member.id)} className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-md hover:bg-blue-200 text-xs sm:text-sm flex items-center mb-1 sm:mb-0" title="點數歷史"><History className="mr-1 h-4 w-4" />{expandedMemberId === member.id ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</button>
                          <button onClick={() => toggleRewardHistoryExpansion(member.id)} className="bg-purple-100 text-purple-700 px-3 py-1.5 rounded-md hover:bg-purple-200 text-xs sm:text-sm flex items-center mb-1 sm:mb-0" title="獎勵歷史"><FileText className="mr-1 h-4 w-4" />{expandedRewardHistoryMemberId === member.id ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</button>
                          <button onClick={() => handleDeleteMember(member.id, member.name)} disabled={isLoading} className="bg-red-500 text-white px-3 py-1.5 rounded-md hover:bg-red-600 text-xs sm:text-sm disabled:bg-slate-300 flex items-center mb-1 sm:mb-0" title="刪除成員"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                      {expandedMemberId === member.id && (
                        <div className="mt-4 pt-4 border-t border-slate-200">
                          <h4 className="text-md font-semibold text-slate-700 mb-2 flex items-center"><History className="mr-2 h-5 w-5 text-blue-600"/>點數歷史紀錄</h4>
                          {isHistoryLoading ? (<p>載入中...</p>) : memberPointHistory.length === 0 ? (<p>無紀錄。</p>) : (
                            <ul className="space-y-2 max-h-60 overflow-y-auto pr-2 text-sm">
                              {memberPointHistory.map(e => (<li key={e.id} className="p-2 bg-slate-50 rounded-md"><div><span>{new Date(e.date.toDate()).toLocaleDateString()}</span> <span className={`font-semibold ${e.points > 0 ? 'text-green-600' : 'text-red-600'}`}>{e.points > 0 ? `+${e.points}` : e.points}點</span></div>{e.notes && <p className="text-xs text-slate-500">備註：{e.notes}</p>}</li>))}
                            </ul>
                          )}
                        </div>
                      )}
                      {expandedRewardHistoryMemberId === member.id && (
                        <div className="mt-4 pt-4 border-t border-slate-200">
                          <h4 className="text-md font-semibold text-slate-700 mb-2 flex items-center"><FileText className="mr-2 h-5 w-5 text-purple-600"/>獎勵兌換歷史</h4>
                          {isRewardHistoryLoading ? (<p>載入中...</p>) : memberRewardHistory.length === 0 ? (<p>無紀錄。</p>) : (
                            <ul className="space-y-2 max-h-60 overflow-y-auto pr-2 text-sm">
                              {memberRewardHistory.map(e => (<li key={e.id} className="p-2 bg-slate-50 rounded-md"><div><span>{new Date(e.redeemedAt.toDate()).toLocaleDateString()}</span> - <span className="font-semibold text-purple-700">{e.rewardDescription}</span> ({e.pointsSpent}點)</div></li>))}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            
            {/* 設定 & 匯出區塊 */}
            <div className="grid md:grid-cols-2 gap-6">
                <section className="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow">
                  <h2 className="text-2xl font-semibold text-sky-600 mb-4 flex items-center"><Settings className="mr-2 h-6 w-6" /> 應用程式設定</h2>
                  <label htmlFor="pointsToReward" className="block text-sm font-medium text-slate-700">兌換獎勵所需點數：</label>
                  <div className="flex space-x-2 items-center mt-1">
                    <input id="pointsToReward" type="number" value={newPointsToReward} onChange={(e) => setNewPointsToReward(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"/>
                    <button onClick={handleUpdateSettings} disabled={isLoading} className="bg-sky-500 text-white px-4 py-3 rounded-lg hover:bg-sky-600 disabled:bg-slate-300">更新</button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">目前：{appSettings.pointsToReward} 點兌換一次。</p>
                </section>

                <section className="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow">
                  <h2 className="text-2xl font-semibold text-sky-600 mb-4 flex items-center"><Download className="mr-2 h-6 w-6" /> 資料匯出 (CSV)</h2>
                  <div className="space-y-2">
                    <button onClick={() => exportData('members', 'csv')} disabled={isLoading} className="w-full bg-teal-500 text-white p-3 rounded-lg hover:bg-teal-600 disabled:bg-slate-300 font-semibold text-sm">匯出成員列表</button>
                    <button onClick={() => exportData('pointsLog', 'csv')} disabled={isLoading} className="w-full bg-teal-500 text-white p-3 rounded-lg hover:bg-teal-600 disabled:bg-slate-300 font-semibold text-sm">匯出點數歷史</button>
                    <button onClick={() => exportData('rewardLog', 'csv')} disabled={isLoading} className="w-full bg-teal-500 text-white p-3 rounded-lg hover:bg-teal-600 disabled:bg-slate-300 font-semibold text-sm">匯出獎勵歷史</button>
                  </div>
                   <p className="text-xs text-slate-500 mt-2">檔案將以 CSV 格式下載，可用 Excel 開啟。TXT 格式內容與 CSV 相同。</p>
                </section>
            </div>
          </div>
        </div>
        <footer className="mt-12 text-center text-sm text-slate-600">
          <p>&copy; {new Date().getFullYear()} 家庭點數獎勵App.</p>
        </footer>
      </div>
    </div>
  );
}

export default App;

