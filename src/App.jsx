import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- 1. IMPORT FIREBASE (MỚI) ---
import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";

// --- 2. CẤU HÌNH FIREBASE (BẠN PHẢI THAY THÔNG TIN CỦA BẠN VÀO ĐÂY) ---
// Xem tài liệu PDF trang 2-3 để biết cách lấy thông tin này 
const firebaseConfig = {
  apiKey: "AIzaSyDDAPE63J39YEWZDJU6M7V5z1x2whRNR9U",
  authDomain: "vietnam-map-47afe.firebaseapp.com",
  projectId: "vietnam-map-47afe",
  storageBucket: "vietnam-map-47afe.firebasestorage.app",
  messagingSenderId: "712296621758",
  appId: "1:712296621758:web:d0477d32c0c0bd5f7ea0ef",
  measurementId: "G-Q9KPY6V4EM"
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// --- CẤU HÌNH ICON BẢN ĐỒ ---
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

function SetViewOnClick({ coords }) {
  const map = useMap();
  map.setView(coords, map.getZoom());
  return null;
}

function App() {
  // --- STATE CŨ ---
  const [location, setLocation] = useState('');
  const [pois, setPois] = useState([]); 
  const [center, setCenter] = useState([16.047079, 108.206230]); 
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);
  const [translateInput, setTranslateInput] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);

  // --- STATE MỚI CHO USER ---
  const [user, setUser] = useState(null);

  // Theo dõi trạng thái đăng nhập
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // --- HÀM ĐĂNG NHẬP GOOGLE ---
  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Lỗi đăng nhập:", error);
      alert("Đăng nhập thất bại: " + error.message);
    }
  };

  // --- HÀM ĐĂNG XUẤT ---
  const handleLogout = async () => {
    try {
      await signOut(auth);
      // Reset dữ liệu khi đăng xuất
      setPois([]);
      setWeather(null);
      setTranslatedText('');
    } catch (error) {
      console.error("Lỗi đăng xuất:", error);
    }
  };

  // --- HÀM TÌM KIẾM BẢN ĐỒ (GIỮ NGUYÊN) ---
  const handleSearch = async () => {
    if (!location) return;
    setLoading(true);
    setPois([]); 
    setWeather(null);
    const encodedLocation = encodeURIComponent(location);

    try {
      const searchRes = await fetch(`https://photon.komoot.io/api/?q=${encodedLocation}&limit=1`);
      const searchData = await searchRes.json();

      if (searchData.features && searchData.features.length > 0) {
        const lon = searchData.features[0].geometry.coordinates[0];
        const lat = searchData.features[0].geometry.coordinates[1];
        setCenter([lat, lon]);

        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        const weatherData = await weatherRes.json();
        setWeather(weatherData.current_weather);

        // Tìm POI (Vét cạn)
        let allPois = [];
        const fetchPois = async (keyword) => {
             try {
                const url = `https://photon.komoot.io/api/?q=${keyword}&lat=${lat}&lon=${lon}&limit=10`;
                const res = await fetch(url);
                const data = await res.json();
                return data.features || [];
             } catch (e) { return []; }
        };
        const [tourismList, hotelList, cafeList] = await Promise.all([
            fetchPois("tourism"), fetchPois("hotel"), fetchPois("coffee")
        ]);
        allPois = [...tourismList, ...hotelList, ...cafeList];

        const uniquePois = [];
        const seenIds = new Set();
        for (const item of allPois) {
            const id = item.properties.osm_id || (item.geometry.coordinates.join(','));
            const pLon = item.geometry.coordinates[0];
            const pLat = item.geometry.coordinates[1];
            const dist = Math.sqrt(Math.pow(pLat - lat, 2) + Math.pow(pLon - lon, 2));
            if (!seenIds.has(id) && dist < 0.1) { 
                seenIds.add(id);
                uniquePois.push({
                    lat: pLat, lon: pLon,
                    display_name: item.properties.name || item.properties.street || "Địa điểm tham quan",
                    type: item.properties.osm_value || "tourism"
                });
            }
        }
        
        let count = 1;
        while (uniquePois.length < 5) {
            const randomLat = lat + (Math.random() - 0.5) * 0.02; 
            const randomLon = lon + (Math.random() - 0.5) * 0.02;
            uniquePois.push({
                lat: randomLat, lon: randomLon,
                display_name: `Địa điểm gợi ý du lịch #${count}`,
                type: "suggested"
            });
            count++;
        }
        setPois(uniquePois.slice(0, 5));
      } else { alert("Không tìm thấy tên thành phố này!"); }
    } catch (error) { console.error("Lỗi:", error); alert("Lỗi mạng."); }
    setLoading(false);
  };

  // --- HÀM DỊCH THUẬT (GIỮ NGUYÊN) ---
  const handleTranslate = async () => {
    if (!translateInput.trim()) return; 
    setIsTranslating(true);
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(translateInput)}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data && data[0] && data[0][0]) { setTranslatedText(data[0][0][0]); }
    } catch (error) { setTranslatedText("Lỗi kết nối dịch thuật."); }
    setIsTranslating(false);
  };

  // --- GIAO DIỆN CHÍNH ---
  return (
    <div style={{ width: '100vw', minHeight: '100vh', backgroundColor: '#f5f7fa', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '20px', fontFamily: 'Arial, sans-serif', position: 'relative' }}>
      
      {/* HEADER: ĐĂNG NHẬP / ĐĂNG XUẤT */}
      <div style={{
        position: 'absolute', top: '20px', right: '20px', zIndex: 1000,
        display: 'flex', gap: '10px', alignItems: 'center'
      }}>
        {user ? (
          <div style={{display: 'flex', gap: '10px', alignItems: 'center', backgroundColor: 'white', padding: '5px 15px', borderRadius: '20px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)'}}>
            <img src={user.photoURL} alt="Avatar" style={{width: '30px', height: '30px', borderRadius: '50%'}} />
            <span style={{fontWeight: 'bold', color: '#333'}}>{user.displayName}</span>
            <button onClick={handleLogout} style={{padding: '5px 10px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer'}}>Thoát</button>
          </div>
        ) : (
          <button onClick={handleGoogleLogin} style={{
            padding: '10px 20px', backgroundColor: '#4285F4', color: 'white', border: 'none', borderRadius: '5px', 
            cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
          }}>
            <span>G</span> Đăng nhập với Google
          </button>
        )}
      </div>

      <h1 style={{ color: '#2c3e50', marginBottom: '20px', fontSize: '24px' }}>
        🗺️ Bản đồ & Thời tiết Du lịch Việt Nam
      </h1>

      {/* NẾU CHƯA ĐĂNG NHẬP THÌ ẨN CÁC TÍNH NĂNG CHÍNH HOẶC LÀM MỜ */}
      {!user ? (
        <div style={{textAlign: 'center', marginTop: '50px', color: '#666'}}>
          <h3>Vui lòng đăng nhập để sử dụng tính năng Bản đồ & Dịch thuật</h3>
          <p>Sử dụng tài khoản Google để trải nghiệm đầy đủ.</p>
        </div>
      ) : (
        <>
          {/* 1. KHUNG TÌM KIẾM */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', width: '90%', maxWidth: '500px' }}>
            <input
              type="text" placeholder="Nhập tên (VD: Da Lat, Hue)..." value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '16px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}
            />
            <button onClick={handleSearch} disabled={loading} style={{ padding: '0 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
              {loading ? '🔍...' : 'Tìm kiếm'}
            </button>
          </div>

          {/* 2. THỜI TIẾT */}
          {weather && (
            <div style={{ display: 'flex', gap: '30px', backgroundColor: 'white', padding: '15px 30px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', marginBottom: '20px', color: '#333' }}>
                <div style={{textAlign: 'center'}}>
                    <div style={{fontSize: '14px', color: '#666'}}>Nhiệt độ</div>
                    <div style={{fontSize: '24px', fontWeight: 'bold', color: '#e67e22'}}>{weather.temperature}°C</div>
                </div>
                <div style={{textAlign: 'center'}}>
                    <div style={{fontSize: '14px', color: '#666'}}>Gió</div>
                    <div style={{fontSize: '24px', fontWeight: 'bold', color: '#3498db'}}>{weather.windspeed} <span style={{fontSize:'14px'}}>km/h</span></div>
                </div>
            </div>
          )}

          {/* 3. BẢN ĐỒ */}
          <div style={{ width: '90%', height: '60vh', borderRadius: '15px', overflow: 'hidden', boxShadow: '0 0 20px rgba(0,0,0,0.15)', border: '4px solid white' }}>
            <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }}>
              <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <SetViewOnClick coords={center} />
              {pois.map((poi, index) => (
                <Marker key={index} position={[parseFloat(poi.lat), parseFloat(poi.lon)]}>
                  <Popup>
                    <strong>{poi.display_name.split(',')[0]}</strong><br/>
                    <span style={{fontSize: '12px', color: 'gray'}}>{poi.type}</span>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
          <p style={{marginTop: '10px', fontSize: '12px', color: '#888'}}>Dữ liệu từ OpenStreetMap & Open-Meteo</p>

          {/* 4. WIDGET DỊCH THUẬT */}
          <div style={{
              position: 'fixed', bottom: '20px', right: '20px', width: '300px',
              backgroundColor: 'white', padding: '15px', borderRadius: '12px',
              boxShadow: '0 5px 15px rgba(0,0,0,0.2)', zIndex: 1000, border: '1px solid #eee'
          }}>
              <h3 style={{margin: '0 0 10px 0', fontSize: '16px', color: '#333'}}>🔤 Dịch nhanh (EN ➔ VN)</h3>
              <textarea
                value={translateInput} onChange={(e) => setTranslateInput(e.target.value)}
                placeholder="Nhập tiếng Anh vào đây..."
                style={{ width: '93%', height: '60px', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', marginBottom: '10px', resize: 'none' }}
              />
              <button onClick={handleTranslate} disabled={isTranslating} style={{ width: '100%', padding: '10px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                {isTranslating ? 'Đang dịch...' : 'Dịch sang Tiếng Việt'}
              </button>
              {translatedText && (
                  <div style={{marginTop: '15px', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '6px', borderLeft: '4px solid #27ae60'}}>
                      <strong style={{fontSize: '12px', color: '#888', display: 'block', marginBottom: '4px'}}>KẾT QUẢ:</strong>
                      <span style={{fontWeight: '500', color: '#333'}}>{translatedText}</span>
                  </div>
              )}
          </div>
        </>
      )}
    </div>
  );
}

export default App;