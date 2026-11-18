/**
 * Firebase 웹 설정은 공개 식별자입니다. 관리자 비밀번호나 비밀키가 아닙니다.
 * 실제 쓰기 권한은 Firebase Authentication과 firestore.rules가 결정합니다.
 */
window.KU_ADMIN_FIREBASE = {
  firebase: {
    apiKey: "AIzaSyBsmdxyZea5BtRjcDDhMW_mWFHytvl2_sg",
    authDomain: "ku-cse-quarterly-admin.firebaseapp.com",
    projectId: "ku-cse-quarterly-admin",
    storageBucket: "ku-cse-quarterly-admin.firebasestorage.app",
    messagingSenderId: "354803900739",
    appId: "1:354803900739:web:239fbb45e1abd66118cff6",
  },
  adminUsername: "jjy",
  loginEmail: "jjy@ku-cse-admin.invalid",
  collection: "siteData",
  documents: {
    events: "events",
    history: "history",
  },
};
