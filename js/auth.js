// js/auth.js - (FİNAL DÜZELTİLMİŞ SÜRÜM)

window.addEventListener('load', () => {
    
    // --- EĞLENCELİ KARŞILAMA ---
    const messages = [
        "Hav hav! Hoş geldin Elif, kemiklerim... yani kalemlerin hazır mı? 🦴✏️",
        "Bugün harika bir gün! Beyin jimnastiği yapmaya ne dersin? 🧠🤸‍♀️",
        "Pati seni beklerken çok sıkıldı... Hadi biraz soru çözüp onu neşelendir! 🐶✨",
        "Dikkat dikkat! Yüksek zeka alarmı! Elif sisteme giriş yapıyor! 🚨😎",
        "Mama saati yaklaşıyor ama önce biraz bilgi depolayalım! 🍖📚",
        "Uyku tulumumdan çıktım, seninle soru çözmeye hazırım şampiyon! 🏆💤",
        "Birileri rekor mu kırmak istiyor? Bence bugün tam günü! 🚀",
        "Bugün kaç net yapacağız? Pati çok merak ediyor! 🤔📈",
        "Sadece senin için kuyruğumu sallıyorum Elif! Hadi başlayalım! 🐕❤️",
        "Soru canavarları korksun, Elif ve Pati iş başında! 👻🚫"
    ];

    const msgEl = document.getElementById("welcomeMsg");
    if (msgEl) {
        const randomMsg = messages[Math.floor(Math.random() * messages.length)];
        msgEl.textContent = randomMsg;
    }

    const loginOverlay = document.getElementById("loginOverlay");
    const btnLogin = document.getElementById("btnLoginGoogle");
    const btnLogout = document.getElementById("btnLogout");
    const errorBox = document.getElementById("loginError");

    if (!loginOverlay) return;

    // 1. Firebase Hazır mı Kontrol Et
    const checkAuthInterval = setInterval(() => {
        if (!window.auth || !window.signInWithPopup) return;
        clearInterval(checkAuthInterval);

        // --- KULLANICI DURUMUNU DİNLE ---
        window.auth.onAuthStateChanged((user) => {
            if (user) {
                // === GİRİŞ YAPILMIŞ ===
                console.log("Giriş Başarılı:", user.displayName);
                
                if(loginOverlay) loginOverlay.style.display = "none"; // Perdeyi kaldır
                
                // --- js/auth.js İÇİNDEKİ İLGİLİ KISIM ---

if (btnLogout) {
    btnLogout.style.display = "flex"; 
    
    // İkonu siliyoruz, yerine direkt yazıyı basıyoruz
    const firstName = user.displayName.split(' ')[0];
    btnLogout.textContent = `Çıkış (${firstName})`; 
}
                
                localStorage.setItem('user_name', user.displayName);

                // İsmi sol taraftaki profil alanına yazıyoruz (Tasarım bozulmaz)
                const headerName = document.getElementById("headerUserName");
                if(headerName) headerName.textContent = user.displayName.split(' ')[0];

            } else {
                // === OTURUM KAPALI ===
                if(loginOverlay) loginOverlay.style.display = "flex"; // Perdeyi indir
                if(btnLogout) btnLogout.style.display = "none";
            }
        });

    }, 100);

    // 2. Giriş Butonu (POPUP KULLANIR)
    if (btnLogin) {
        btnLogin.onclick = async () => {
            if(errorBox) errorBox.style.display = "none";
            
            try {
                await window.signInWithPopup(window.auth, window.googleProvider);
            } catch (error) {
                console.error("Giriş Hatası:", error);
                if(errorBox) {
                    errorBox.textContent = "Hata: " + error.message;
                    errorBox.style.display = "block";
                }
            }
        };
    }

    // DÜZELTME 2: Çıkış butonu tıklama olayını (onclick) BURADAN TAMAMEN KALDIRDIK.
    // Çünkü o işi artık 'app.js' dosyasındaki özel modal kodu yapıyor.
    // Buradaki eski 'confirm' kodu silindiği için artık beyaz kutu çıkmayacak.
});