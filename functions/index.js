// Cloud Function: envía notificación push (FCM) cada vez que se crea un documento en /notifications.
// Requiere plan Blaze. Despliegue: firebase deploy --only functions
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

exports.pushOnNotification = onDocumentCreated("notifications/{id}", async (event) => {
  const n = event.data?.data();
  if (!n) return;
  const owner = n.to === "admin" ? "admin" : `member:${n.to}`;
  const db = getFirestore();
  const snap = await db.collection("tokens").where("owner", "==", owner).get();
  const tokens = snap.docs.map((d) => d.id);
  if (!tokens.length) return;

  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: n.title || "Team Savage", body: n.body || "" },
    data: { link: n.to === "admin" ? "./index.html#/admin/inicio" : "./index.html#/app" },
    webpush: { fcmOptions: { link: n.to === "admin" ? "/#/admin/inicio" : "/#/app" } },
  });
  // Limpia tokens inválidos
  await Promise.all(res.responses.map((r, i) =>
    !r.success && /registration-token-not-registered|invalid-argument/.test(r.error?.code || "")
      ? db.collection("tokens").doc(tokens[i]).delete() : null));
});
