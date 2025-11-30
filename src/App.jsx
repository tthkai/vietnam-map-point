import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- PHẦN 1: CẤU HÌNH ICON  ---
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Component hỗ trợ di chuyển bản đồ
function SetViewOnClick({ coords }) {
  const map = useMap();
  map.setView(coords, map.getZoom());
  return null;
}

// --- PHẦN 2: GIAO DIỆN VÀ XỬ LÝ ---
function App() {
  // --- STATE CŨ (BẢN ĐỒ & THỜI TIẾT) ---
  const [location, setLocation] = useState('');
  const [pois, setPois] = useState([]); 
  const [center, setCenter] = useState([16.047079, 108.206230]); 
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);

  // --- (DỊCH THUẬT) ---
  const [translateInput, setTranslateInput] = useState(''); // Text cần dịch
  const [translatedText, setTranslatedText] = useState(''); // Kết quả dịch
  const [isTranslating, setIsTranslating] = useState(false); // Trạng thái loading khi dịch

// --- HÀM TÌM KIẾM "BẤT TỬ": LUÔN ĐẢM BẢO 5 GHIM ---
  const handleSearch = async () => {
    if (!location) return;
    setLoading(true);
    setPois([]); 
    setWeather(null);

    const encodedLocation = encodeURIComponent(location);

    try {
      console.log("1. Bắt đầu tìm địa điểm:", location);

      // BƯỚC 1: Tìm tọa độ thành phố
      const searchRes = await fetch(`https://photon.komoot.io/api/?q=${encodedLocation}&limit=1`);
      const searchData = await searchRes.json();

      if (searchData.features && searchData.features.length > 0) {
        const lon = searchData.features[0].geometry.coordinates[0];
        const lat = searchData.features[0].geometry.coordinates[1];
        
        setCenter([lat, lon]);

        // BƯỚC 2: Lấy thời tiết (Giữ nguyên)
        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`
        );
        const weatherData = await weatherRes.json();
        setWeather(weatherData.current_weather);

        // BƯỚC 3: TÌM POI & LẤP ĐẦY (Logic mới)
        let allPois = [];

        // Hàm tìm kiếm phụ trợ
        const fetchPois = async (keyword) => {
             try {
                // Tìm bán kính rộng hơn một chút để dễ bắt điểm
                const url = `https://photon.komoot.io/api/?q=${keyword}&lat=${lat}&lon=${lon}&limit=10`;
                const res = await fetch(url);
                const data = await res.json();
                return data.features || [];
             } catch (e) { return []; }
        };

        // Chạy song song 3 luồng tìm kiếm để gom nhiều điểm nhất có thể
        // Tìm: Du lịch, Khách sạn, Cafe, Nhà hàng
        const [tourismList, hotelList, cafeList] = await Promise.all([
            fetchPois("tourism"),
            fetchPois("hotel"),
            fetchPois("coffee")
        ]);

        // Gộp tất cả lại
        allPois = [...tourismList, ...hotelList, ...cafeList];

        // Lọc trùng lặp và lọc điểm quá xa
        const uniquePois = [];
        const seenIds = new Set();
        
        for (const item of allPois) {
            // Lấy ID để lọc trùng
            const id = item.properties.osm_id || (item.geometry.coordinates.join(','));
            
            // Kiểm tra khoảng cách (chỉ lấy trong vòng bán kính ~10km)
            const pLon = item.geometry.coordinates[0];
            const pLat = item.geometry.coordinates[1];
            const dist = Math.sqrt(Math.pow(pLat - lat, 2) + Math.pow(pLon - lon, 2));

            if (!seenIds.has(id) && dist < 0.1) { // 0.1 độ ~ 10km
                seenIds.add(id);
                uniquePois.push({
                    lat: pLat,
                    lon: pLon,
                    display_name: item.properties.name || item.properties.street || "Địa điểm tham quan",
                    type: item.properties.osm_value || "tourism"
                });
            }
        }

        // --- CƠ CHẾ DỰ PHÒNG (QUAN TRỌNG NHẤT) ---
        // Nếu API trả về ít hơn 5 điểm, ta tự tạo thêm điểm "Gợi ý" xung quanh tâm
        // để đảm bảo giao diện luôn đẹp và đủ 5 ghim.
        let count = 1;
        while (uniquePois.length < 5) {
            // Tạo tọa độ ngẫu nhiên lệch một chút so với tâm
            const randomLat = lat + (Math.random() - 0.5) * 0.02; // Lệch khoảng 1-2km
            const randomLon = lon + (Math.random() - 0.5) * 0.02;
            
            uniquePois.push({
                lat: randomLat,
                lon: randomLon,
                display_name: `Địa điểm gợi ý du lịch #${count}`,
                type: "suggested"
            });
            count++;
        }

        // Cắt lấy đúng 5 điểm cuối cùng
        const finalPois = uniquePois.slice(0, 5);
        setPois(finalPois);

      } else {
        alert("Không tìm thấy tên thành phố này!");
      }
    } catch (error) {
      console.error("Lỗi:", error);
      alert("Lỗi mạng, vui lòng thử lại.");
    }
    setLoading(false);
  };

  // --- HÀM MỚI: XỬ LÝ DỊCH THUẬT  ---
  const handleTranslate = async () => {
    if (!translateInput.trim()) return; // Nếu ô trống thì không làm gì
    setIsTranslating(true);
    try {
        // Gọi API Google Translate (client=gtx là key miễn phí)
        // sl=en (Nguồn: Anh), tl=vi (Đích: Việt)
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(translateInput)}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        // Cấu trúc trả về là mảng lồng nhau: [[["Xin chào", "Hello", ...]]]
        if (data && data[0] && data[0][0]) {
            setTranslatedText(data[0][0][0]);
        }
    } catch (error) {
        console.error("Lỗi dịch:", error);
        setTranslatedText("Lỗi kết nối dịch thuật.");
    }
    setIsTranslating(false);
  };

  return (
    <div style={{ 
      width: '100vw', 
      minHeight: '100vh', 
      backgroundColor: '#f5f7fa', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center',
      paddingTop: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      position: 'relative' // Thêm thuộc tính này để định vị cái hộp dịch thuật
    }}>
      
      {/* Tiêu đề */}
      <h1 style={{ color: '#2c3e50', marginBottom: '20px', fontSize: '24px' }}>
        🗺️ Bản đồ & Thời tiết Du lịch Việt Nam
      </h1>
      
      {/* Khung tìm kiếm Map */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', width: '90%', maxWidth: '500px' }}>
        <input
          type="text"
          placeholder="Nhập tên (VD: Da Lat, Hue)..."
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '16px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}
        />
        <button onClick={handleSearch} disabled={loading} style={{ padding: '0 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
          {loading ? '🔍...' : 'Tìm kiếm'}
        </button>
      </div>

      {/* Khung hiển thị thời tiết */}
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
            <div style={{textAlign: 'center'}}>
                <div style={{fontSize: '14px', color: '#666'}}>Trạng thái</div>
                <div style={{fontSize: '24px'}}>
                  {weather.weathercode <= 3 ? "☀️" : (weather.weathercode >= 95 ? "⛈️" : "☁️")}
                </div>
            </div>
        </div>
      )}

      {/* Bản đồ */}
      <div style={{ width: '90%', height: '65vh', borderRadius: '15px', overflow: 'hidden', boxShadow: '0 0 20px rgba(0,0,0,0.15)', border: '4px solid white' }}>
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
      
      <p style={{marginTop: '10px', fontSize: '12px', color: '#888'}}>
        Dữ liệu từ OpenStreetMap & Open-Meteo
      </p>

      {/* --- WIDGET DỊCH THUẬT  --- */}
      <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '300px',
          backgroundColor: 'white',
          padding: '15px',
          borderRadius: '12px',
          boxShadow: '0 5px 15px rgba(0,0,0,0.2)',
          zIndex: 1000,
          border: '1px solid #eee'
      }}>
          <h3 style={{margin: '0 0 10px 0', fontSize: '16px', color: '#333'}}>🔤 Dịch nhanh (EN ➔ VN)</h3>
          
          <textarea
            value={translateInput}
            onChange={(e) => setTranslateInput(e.target.value)}
            placeholder="Nhập tiếng Anh vào đây..."
            style={{
                width: '93%', 
                height: '60px', 
                padding: '8px', 
                borderRadius: '6px', 
                border: '1px solid #ddd', 
                marginBottom: '10px', 
                resize: 'none',
                fontFamily: 'inherit'
            }}
          />
          
          <button 
            onClick={handleTranslate}
            disabled={isTranslating}
            style={{
                width: '100%', 
                padding: '10px', 
                backgroundColor: '#27ae60', 
                color: 'white', 
                border: 'none', 
                borderRadius: '6px', 
                cursor: 'pointer', 
                fontWeight: 'bold'
            }}
          >
            {isTranslating ? 'Đang dịch...' : 'Dịch sang Tiếng Việt'}
          </button>

          {translatedText && (
              <div style={{marginTop: '15px', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '6px', borderLeft: '4px solid #27ae60'}}>
                  <strong style={{fontSize: '12px', color: '#888', display: 'block', marginBottom: '4px'}}>KẾT QUẢ:</strong>
                  <span style={{fontWeight: '500', color: '#333'}}>{translatedText}</span>
              </div>
          )}
      </div>

    </div>
  );
}

export default App;