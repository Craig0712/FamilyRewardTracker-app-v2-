import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithPopup, // 用於 Google 登入
  GoogleAuthProvider, // Google 登入的 Provider
  signOut
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  collection, 
  addDoc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  where, 
  Timestamp, 
  writeBatch 
} from 'firebase/firestore';
import { UserPlus, Trash2, Gift, Settings, Award, PlusCircle, ChevronDown, ChevronUp, ListChecks, History, FileText, Download, LogIn, LogOut } from 'lucide-react'; // Removed UserCog as it's less relevant now

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
const globalAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider(); // 初始化 Google Provider

// 主應用程式組件
function App() {
  const [currentUser, setCurrentUser] = useState(null); // Firebase Auth User object
  const [currentUserId, setCurrentUserId] = useState(null); // UID of the logged-in user
  const [isAuthReady, setIsAuthReady] = useState(false); // Firebase Auth 初始化完成
  const [isAdmin, setIsAdmin] = useState(false); // 新增：判斷是否為管理者

  // 登入相關 state
  const [loginError, setLoginError] = useState('');

  const [members, setMembers] = useState([]);
  const [newMemberName, setNewMemberName] = useState('');

  const [pointsInput, setPointsInput] = useState('');
  const [selectedMemberIdForPoints, setSelectedMemberIdForPoints] = useState('');
  const [pointsDate, setPointsDate] = useState(new Date().toISOString().split('T')[0]);
  const [pointsNotes, setPointsNotes] = useState('');

  const [appSettings, setAppSettings] = useState({ pointsToReward: 100 });
  const [newPointsToReward, setNewPointsToReward] = useState(100);

  const [notification, setNotification] = useState({ message: '', type: '' });
  const [isLoading, setIsLoading] = useState(false);

  const [expandedMemberId, setExpandedMemberId] = useState(null);
  const [expandedRewardHistoryMemberId, setExpandedRewardHistoryMemberId] = useState(null);

  const [memberPointHistory, setMemberPointHistory] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const [memberRewardHistory, setMemberRewardHistory] = useState([]);
  const [isRewardHistoryLoading, setIsRewardHistoryLoading] = useState(false);

  const [isRedeemModalOpen, setIsRedeemModalOpen] = useState(false);
  const [memberToRedeem, setMemberToRedeem] = useState(null);
  const [rewardDescriptionInput, setRewardDescriptionInput] = useState('');
  
  // Firebase 路徑生成函數
  const getMembersCollectionPath = useCallback(() => {
    if (!currentUserId) return null;
    return `/artifacts/${globalAppId}/users/${currentUserId}/familyMembers`;
  }, [currentUserId]);

  const getPointsLogCollectionPath = useCallback(() => {
    if (!currentUserId) return null;
    return `/artifacts/${globalAppId}/users/${currentUserId}/pointsLog`;
  }, [currentUserId]);

  const getRewardLogCollectionPath = useCallback(() => {
    if (!currentUserId) return null;
    return `/artifacts/${globalAppId}/users/${currentUserId}/rewardLog`;
  }, [currentUserId]);

  const getSettingsDocPath = useCallback(() => {
    if (!currentUserId) return null;
    return `/artifacts/${globalAppId}/users/${currentUserId}/appSettings/config`;
  }, [currentUserId]);

  // 認証狀態監聽
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // 檢查是否為管理者 (基於 Email)
        // 重要：將 'YOUR_ADMIN_GOOGLE_EMAIL@gmail.com' 替換成您實際的管理者 Google Email
        const adminEmail = "YOUR_ADMIN_GOOGLE_EMAIL@gmail.com"; // 在此處或從環境變數設定管理者 Email
        if (user.email === adminEmail) {
          setCurrentUser(user);
          setCurrentUserId(user.uid);
          setIsAdmin(true);
          setLoginError('');
        } else {
          // 非管理者嘗試登入
          setCurrentUser(null);
          setCurrentUserId(null);
          setIsAdmin(false);
          setLoginError('存取被拒絕：此帳號非管理者帳號。');
          await signOut(auth); // 自動登出非管理者
        }
      } else {
        setCurrentUser(null);
        setCurrentUserId(null);
        setIsAdmin(false);
        setMembers([]);
        setAppSettings({ pointsToReward: 100 });
        setNewPointsToReward(100);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // 處理 Google 登入
  const handleGoogleLogin = async () => {
    setLoginError('');
    setIsLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged 會處理後續 currentUser 和 isAdmin 設定
    } catch (error) {
      console.error("Google Login error:", error);
      // 根據錯誤碼提供更友善的提示
      let message = "Google 登入失敗。";
      if (error.code === 'auth/popup-closed-by-user') {
        message = "登入視窗已關閉，請重試。";
      } else if (error.code === 'auth/cancelled-popup-request') {
        message = "登入請求已取消。";
      }
      setLoginError(message);
      showNotification(message, "error");
    }
    setIsLoading(false);
  };

  // 處理登出
  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await signOut(auth);
      showNotification("已成功登出", "success");
    } catch (error) {
      console.error("Logout error:", error);
      showNotification("登出失敗: " + error.message, "error");
    }
    setIsLoading(false);
  };

  // 顯示通知
  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: '', type: '' }), 3000);
  };

  // 獲取設定
  useEffect(() => {
    if (!isAuthReady || !currentUserId || !isAdmin) {
      setAppSettings({ pointsToReward: 100 });
      setNewPointsToReward(100);
      return;
    }
    const settingsPath = getSettingsDocPath();
    if (!settingsPath) return;

    const settingsRef = doc(db, settingsPath);
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setAppSettings(data);
        setNewPointsToReward(data.pointsToReward);
      } else {
        setDoc(settingsRef, { pointsToReward: 100 })
          .then(() => console.log("Default settings created for admin user:", currentUserId))
          .catch(error => console.error("Error creating default settings:", error));
      }
    }, (error) => {
      console.error("Error fetching settings: ", error);
      showNotification("讀取設定失敗", "error");
    });
    return () => unsubscribe();
  }, [isAuthReady, currentUserId, isAdmin, getSettingsDocPath]);

  // 獲取成員列表
  useEffect(() => {
    if (!isAuthReady || !currentUserId || !isAdmin) {
      setMembers([]);
      return;
    }
    const membersPath = getMembersCollectionPath();
    if (!membersPath) return;
    
    const membersRef = collection(db, membersPath);
    const q = query(membersRef);
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const membersList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      membersList.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setMembers(membersList);
      if (membersList.length > 0 && !selectedMemberIdForPoints) {
        setSelectedMemberIdForPoints(membersList[0].id);
      } else if (membersList.length === 0) {
        setSelectedMemberIdForPoints('');
      }
    }, (error) => {
      console.error("Error fetching members: ", error);
      showNotification("讀取成員列表失敗", "error");
    });
    return () => unsubscribe();
  }, [isAuthReady, currentUserId, isAdmin, getMembersCollectionPath, selectedMemberIdForPoints]);

  // 新增成員
  const handleAddMember = async () => {
    if (!newMemberName.trim()) { showNotification("成員名稱不能為空", "error"); return; }
    if (!currentUserId || !isAdmin) { showNotification("僅管理者可執行此操作", "error"); return; }
    
    const membersPath = getMembersCollectionPath();
    if (!membersPath) { showNotification("無法取得資料路徑", "error"); return; }

    setIsLoading(true);
    try {
      await addDoc(collection(db, membersPath), {
        name: newMemberName.trim(), totalPoints: 0, rewardCount: 0, createdAt: Timestamp.now()
      });
      showNotification(`成員 "${newMemberName.trim()}" 新增成功`, "success");
      setNewMemberName('');
    } catch (error) {
      console.error("Error adding member: ", error);
      showNotification("新增成員失敗: " + error.message, "error");
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

  // 刪除成員
  const handleDeleteMember = async (memberId, memberName) => {
    const confirmed = await showCustomConfirm(`確定要刪除成員 "${memberName}" 嗎？這將會刪除該成員的所有點數及獎勵紀錄。`);
    if (!confirmed) return;
    if (!currentUserId || !isAdmin) { showNotification("僅管理者可執行此操作", "error"); return; }

    const membersPath = getMembersCollectionPath();
    const pointsLogPath = getPointsLogCollectionPath();
    const rewardLogPath = getRewardLogCollectionPath();

    if (!membersPath || !pointsLogPath || !rewardLogPath) {
      showNotification("無法取得資料路徑，刪除失敗", "error"); return;
    }

    setIsLoading(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, membersPath, memberId));
      
      const pointsLogQuery = query(collection(db, pointsLogPath), where("memberId", "==", memberId));
      const pointsLogSnapshot = await getDocs(pointsLogQuery);
      pointsLogSnapshot.forEach(doc => batch.delete(doc.ref));

      const rewardLogQuery = query(collection(db, rewardLogPath), where("memberId", "==", memberId));
      const rewardLogSnapshot = await getDocs(rewardLogQuery);
      rewardLogSnapshot.forEach(doc => batch.delete(doc.ref));

      await batch.commit();
      showNotification(`成員 "${memberName}" 及相關紀錄已刪除`, "success");
      if (selectedMemberIdForPoints === memberId) {
        setSelectedMemberIdForPoints(members.length > 1 ? members.find(m => m.id !== memberId)?.id || '' : '');
      }
    } catch (error) {
      console.error("Error deleting member: ", error);
      showNotification("刪除成員失敗: " + error.message, "error");
    }
    setIsLoading(false);
  };

  // 新增點數紀錄
  const handleAddPoints = async () => {
    if (!selectedMemberIdForPoints) { showNotification("請選擇成員", "error"); return; }
    const points = parseInt(pointsInput);
    if (isNaN(points) || points <= 0) { showNotification("請輸入有效的點數 (正整數)", "error"); return; }
    if (!pointsDate) { showNotification("請選擇日期", "error"); return; }
    if (!currentUserId || !isAdmin) { showNotification("僅管理者可執行此操作", "error"); return; }

    const membersPath = getMembersCollectionPath();
    const pointsLogPath = getPointsLogCollectionPath();
    if (!membersPath || !pointsLogPath) { showNotification("無法取得資料路徑", "error"); return; }

    setIsLoading(true);
    try {
      const memberRef = doc(db, membersPath, selectedMemberIdForPoints);
      const memberDoc = await getDoc(memberRef);
      if (!memberDoc.exists()) { showNotification("選擇的成員不存在", "error"); setIsLoading(false); return; }
      
      const memberData = memberDoc.data();
      const newTotalPoints = (memberData.totalPoints || 0) + points;
      const batch = writeBatch(db);
      batch.set(doc(collection(db, pointsLogPath)), {
        memberId: selectedMemberIdForPoints, memberName: memberData.name, points: points,
        date: Timestamp.fromDate(new Date(pointsDate)), notes: pointsNotes.trim(), createdAt: Timestamp.now()
      });
      batch.update(memberRef, { totalPoints: newTotalPoints });
      await batch.commit();
      showNotification(`已為 ${memberData.name} 新增 ${points} 點`, "success");
      setPointsInput(''); setPointsNotes('');
    } catch (error) {
      console.error("Error adding points: ", error); showNotification("新增點數失敗: " + error.message, "error");
    }
    setIsLoading(false);
  };

  // 開啟兌換獎勵 Modal
  const openRedeemModal = (member) => {
    if (!currentUserId || !isAdmin) { showNotification("僅管理者可執行此操作", "error"); return; }
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
    if (!memberToRedeem || !rewardDescriptionInput.trim()) { showNotification("請輸入獎勵內容", "error"); return; }
    if (!currentUserId || !isAdmin) { showNotification("僅管理者可執行此操作", "error"); return; }

    const membersPath = getMembersCollectionPath();
    const rewardLogPath = getRewardLogCollectionPath();
    if (!membersPath || !rewardLogPath) { showNotification("無法取得資料路徑", "error"); return; }

    setIsLoading(true);
    try {
      const memberRef = doc(db, membersPath, memberToRedeem.id);
      const memberData = memberToRedeem; 

      const newTotalPoints = memberData.totalPoints - appSettings.pointsToReward;
      const newRewardCount = (memberData.rewardCount || 0) + 1;

      const batch = writeBatch(db);
      batch.set(doc(collection(db, rewardLogPath)), {
        memberId: memberToRedeem.id, memberName: memberData.name,
        rewardDescription: rewardDescriptionInput.trim(), pointsSpent: appSettings.pointsToReward,
        redeemedAt: Timestamp.now()
      });
      batch.update(memberRef, { totalPoints: newTotalPoints, rewardCount: newRewardCount });
      await batch.commit();
      showNotification(`${memberData.name} 成功兌換獎勵: ${rewardDescriptionInput.trim()}`, "success");
      setIsRedeemModalOpen(false); setMemberToRedeem(null); setRewardDescriptionInput('');
    } catch (error) {
      console.error("Error redeeming reward: ", error); showNotification("兌換獎勵失敗: " + error.message, "error");
    }
    setIsLoading(false);
  };

  // 更新設定
  const handleUpdateSettings = async () => {
    const points = parseInt(newPointsToReward);
    if (isNaN(points) || points <= 0) { showNotification("請輸入有效的兌換所需點數", "error"); return; }
    if (!currentUserId || !isAdmin) { showNotification("僅管理者可執行此操作", "error"); return; }

    const settingsPath = getSettingsDocPath();
    if (!settingsPath) { showNotification("無法取得資料路徑", "error"); return; }
    
    setIsLoading(true);
    try {
      await setDoc(doc(db, settingsPath), { pointsToReward: points });
      showNotification("設定更新成功", "success");
    } catch (error) {
      console.error("Error updating settings: ", error); showNotification("更新設定失敗: " + error.message, "error");
    }
    setIsLoading(false);
  };

  // 獲取成員點數歷史紀錄
  const fetchMemberPointHistory = useCallback(async (memberId) => {
    if (!currentUserId || !isAdmin || !memberId) return;
    const pointsLogPath = getPointsLogCollectionPath();
    if (!pointsLogPath) return;

    setIsHistoryLoading(true);
    try {
      const q = query(collection(db, pointsLogPath), where("memberId", "==", memberId));
      const querySnapshot = await getDocs(q);
      let history = querySnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
      history.sort((a, b) => b.date.toMillis() - a.date.toMillis());
      setMemberPointHistory(history);
    } catch (error) {
      console.error("Error fetching point history:", error); showNotification("讀取點數歷史失敗", "error");
    }
    setIsHistoryLoading(false);
  }, [currentUserId, isAdmin, getPointsLogCollectionPath]);

  const toggleMemberExpansion = (memberId) => {
    if (expandedMemberId === memberId) {
      setExpandedMemberId(null); setMemberPointHistory([]);
    } else {
      setExpandedMemberId(memberId); fetchMemberPointHistory(memberId);
      setExpandedRewardHistoryMemberId(null); setMemberRewardHistory([]); 
    }
  };

  // 獲取成員獎勵歷史紀錄
  const fetchMemberRewardHistory = useCallback(async (memberId) => {
    if (!currentUserId || !isAdmin || !memberId) return;
    const rewardLogPath = getRewardLogCollectionPath();
    if (!rewardLogPath) return;

    setIsRewardHistoryLoading(true);
    try {
      const q = query(collection(db, rewardLogPath), where("memberId", "==", memberId));
      const querySnapshot = await getDocs(q);
      let history = querySnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
      history.sort((a, b) => b.redeemedAt.toMillis() - a.redeemedAt.toMillis());
      setMemberRewardHistory(history);
    } catch (error) { // Corrected syntax: removed "=>"
      console.error("Error fetching reward history:", error); showNotification("讀取獎勵歷史失敗", "error");
    }
    setIsRewardHistoryLoading(false);
  }, [currentUserId, isAdmin, getRewardLogCollectionPath]);

  const toggleRewardHistoryExpansion = (memberId) => {
    if (expandedRewardHistoryMemberId === memberId) {
      setExpandedRewardHistoryMemberId(null); setMemberRewardHistory([]);
    } else {
      setExpandedRewardHistoryMemberId(memberId); fetchMemberRewardHistory(memberId);
      setExpandedMemberId(null); setMemberPointHistory([]); 
    }
  };

  // 資料匯出 (與先前版本相同，但增加了 isAdmin 檢查)
  const exportData = async (dataType, format = 'csv') => {
    if (!currentUserId || !isAdmin) { showNotification("僅管理者可執行此操作", "error"); return; }
    
    const membersPath = getMembersCollectionPath();
    const pointsLogPath = getPointsLogCollectionPath();
    const rewardLogPath = getRewardLogCollectionPath();

    if (!membersPath || !pointsLogPath || !rewardLogPath) {
      showNotification("無法取得資料路徑，匯出失敗", "error"); return;
    }
    // ... (其餘匯出邏輯與前一版相同)
    setIsLoading(true);
    let dataToExport = [];
    let headers = [];
    let filename = `${dataType}_export.${format}`;

    try {
      if (dataType === 'members') {
        headers = ['ID', '名稱', '總點數', '獎勵次數', '建立時間'];
        const membersSnapshot = await getDocs(collection(db, membersPath));
        dataToExport = membersSnapshot.docs.map(doc => {
          const data = doc.data();
          return { id: doc.id, 名称: data.name, 总点数: data.totalPoints, 奖励次数: data.rewardCount, 建立时间: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : '' };
        });
        filename = `成員列表.${format}`;
      } else if (dataType === 'pointsLog') {
        headers = ['紀錄ID', '成員ID', '成員名稱', '點數', '日期', '備註', '記錄時間'];
        const pointsLogSnapshot = await getDocs(collection(db, pointsLogPath));
        dataToExport = pointsLogSnapshot.docs.map(doc => {
          const data = doc.data();
          return { 纪录id: doc.id, 成员id: data.memberId, 成员名称: data.memberName, 点数: data.points, 日期: data.date?.toDate ? data.date.toDate().toLocaleDateString() : '', 备注: data.notes, 记录时间: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : '' };
        });
        filename = `點數歷史紀錄.${format}`;
      } else if (dataType === 'rewardLog') {
        headers = ['紀錄ID', '成員ID', '成員名稱', '獎勵內容', '花費點數', '兌換時間'];
        const rewardLogSnapshot = await getDocs(collection(db, rewardLogPath));
        dataToExport = rewardLogSnapshot.docs.map(doc => {
          const data = doc.data();
          return { 纪录id: doc.id, 成员id: data.memberId, 成员名称: data.memberName, 奖励内容: data.rewardDescription, 花费点数: data.pointsSpent, 兑换时间: data.redeemedAt?.toDate ? data.redeemedAt.toDate().toLocaleString() : '' };
        });
        filename = `獎勵兌換歷史.${format}`;
      }

      if (dataToExport.length === 0) { showNotification("沒有可匯出的資料", "info"); setIsLoading(false); return; }
      
      const mappedData = dataToExport.map(item => {
        const newItem = {};
        headers.forEach(header => {
            const keyInItem = Object.keys(item).find(k => k.toLowerCase().replace(/\s+/g, '') === header.toLowerCase().replace(/\s+/g, '')) || header;
            newItem[header] = item[keyInItem];
        });
        return newItem;
      });

      const fileContent = convertToCsv(mappedData, headers);
      downloadFile(filename, fileContent, format === 'txt' ? 'text/plain;charset=utf-8;' : 'text/csv;charset=utf-8;');
      showNotification("資料匯出成功", "success");
    } catch (error) {
      console.error(`Error exporting ${dataType}: `, error); showNotification("資料匯出失敗: " + error.message, "error");
    }
    setIsLoading(false);
  };
  // UI 渲染
  if (!isAuthReady) {
    return <div className="flex justify-center items-center h-screen bg-slate-100 text-slate-700"><div>正在載入認證服務...</div></div>;
  }

  // 如果未登入或非管理者，顯示登入按鈕
  if (!currentUser || !isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-100 to-blue-200 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md text-center">
          <h1 className="text-3xl font-bold text-sky-700 mb-8">家庭點數獎勵系統</h1>
          <p className="text-slate-600 mb-2">請使用您的 Google 帳號登入以管理系統。</p>
          <p className="text-xs text-slate-500 mb-6">(僅限授權的管理者帳號)</p>
          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full bg-red-600 text-white p-4 rounded-lg hover:bg-red-700 transition-colors disabled:bg-slate-400 font-semibold text-lg flex items-center justify-center shadow-md hover:shadow-lg"
          >
            <svg className="w-6 h-6 mr-3" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#FFFFFF" d="M21.35,11.1H12.18V13.83H18.69C18.36,17.64 15.19,19.27 12.19,19.27C8.36,19.27 5,16.25 5,12C5,7.9 8.2,4.73 12.19,4.73C14.03,4.73 15.69,5.36 16.95,6.57L19.05,4.8C17.19,3.11 14.9,2 12.19,2C6.42,2 2.03,6.8 2.03,12C2.03,17.05 6.16,22 12.19,22C17.6,22 21.54,18.33 21.54,12.81C21.54,12.21 21.45,11.65 21.35,11.1Z"/></svg>
            使用 Google 帳號登入
          </button>
          {loginError && <p className="mt-4 text-sm text-red-600">{loginError}</p>}
        </div>
        {notification.message && (
          <div className={`fixed top-5 right-5 p-4 rounded-lg shadow-lg text-white ${notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'} z-50`}>
            {notification.message}
          </div>
        )}
      </div>
    );
  }
  
  // 已登入且為管理者，顯示主應用程式介面
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 to-blue-200 p-4 sm:p-6 md:p-8 font-sans">
      <div className="container mx-auto max-w-5xl">
        <header className="mb-8">
          <div className="flex justify-between items-center">
            <h1 className="text-4xl font-bold text-sky-700">家庭點數獎勵系統</h1>
            <div className="flex items-center space-x-3">
              <span className="text-sm text-slate-600 hidden sm:inline">管理者: {currentUser.email}</span>
              <button
                onClick={handleLogout}
                disabled={isLoading}
                className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors disabled:bg-slate-300 flex items-center"
              >
                <LogOut className="mr-2 h-5 w-5" /> 登出
              </button>
            </div>
          </div>
          {currentUserId && <p className="text-xs text-slate-500 mt-1">管理者 UID: {currentUserId}</p>}
        </header>

        {/* ... 其餘 UI (通知, Modal, 主要內容區塊) 與前一版管理者登入後相同 ... */}
        {notification.message && (
          <div className={`fixed top-5 right-5 p-4 rounded-lg shadow-lg text-white ${notification.type === 'success' ? 'bg-green-500' : notification.type === 'info' ? 'bg-blue-500' : 'bg-red-500'} z-50`}>
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
        
        <div className="grid lg:grid-cols-3 gap-6">
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
          <div className="lg:col-span-2 space-y-6">
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
                   <p className="text-xs text-slate-500 mt-2">檔案將以 CSV 格式下載。</p>
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
