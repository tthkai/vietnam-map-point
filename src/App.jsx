import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- PHẦN 1: CẤU HÌNH ICON ---
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
  const [location, setLocation] = useState('');
  const [pois, setPois] = useState([]); // Danh sách 5 điểm POI
  const [center, setCenter] = useState([16.047079, 108.206230]); // Mặc định Đà Nẵng
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!location) return;
    setLoading(true);
    setPois([]); // Xóa điểm cũ
    setWeather(null);

    try {
      console.log("1. Bắt đầu tìm địa điểm:", location);

      // BƯỚC 1: Tìm tọa độ thành phố
      const searchRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${location}&countrycodes=vn&limit=1`);
      const searchData = await searchRes.json();

      if (searchData.length > 0) {
        const lat = parseFloat(searchData[0].lat);
        const lon = parseFloat(searchData[0].lon);
        setCenter([lat, lon]);
        console.log(`=> Tọa độ tìm thấy: ${lat}, ${lon}`);

        // BƯỚC 2: Lấy thời tiết 
        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`
        );
        const weatherData = await weatherRes.json();
        setWeather(weatherData.current_weather);

        // BƯỚC 3: TÌM 5 POINTS 
      
        
        // Thử lần 1: Tìm địa điểm du lịch (tourism)
        let poiRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=tourism+near+[${lat},${lon}]&limit=5`);
        let poiData = await poiRes.json();
        console.log("Kết quả tìm Tourism:", poiData.length);

        // Thử lần 2: Nếu không ra, tìm Di tích/Lịch sử (historic)
        if (poiData.length === 0) {
            console.log("Không thấy Tourism, đang tìm Historic...");
            poiRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=historic+near+[${lat},${lon}]&limit=5`);
            poiData = await poiRes.json();
        }

        // Thử lần 3: Nếu vẫn không ra, tìm Khách sạn (hotel) - Cái này chắc chắn có
        if (poiData.length === 0) {
            console.log("Không thấy Historic, đang tìm Hotel...");
            poiRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=hotel+near+[${lat},${lon}]&limit=5`);
            poiData = await poiRes.json();
        }

        // Cập nhật State
        if (poiData.length > 0) {
            setPois(poiData);
            console.log("=> Đã lưu danh sách điểm vào state:", poiData);
        } else {
            alert("Khu vực này hoang vắng quá, không tìm thấy điểm nào!");
        }

      } else {
        alert("Không tìm thấy tên thành phố này!");
      }
    } catch (error) {
      console.error("Lỗi:", error);
      alert("Lỗi kết nối API.");
    }
    setLoading(false);
  };

  return (

    <div style={{ 
      width: '100vw', 
      minHeight: '100vh', 
      backgroundColor: '#f5f7fa', // Màu nền xám nhạt 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center',
      paddingTop: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    }}>
      
      {/* Tiêu đề */}
      <h1 style={{ color: '#2c3e50', marginBottom: '20px', fontSize: '24px' }}>
        🗺️ Bản đồ & Thời tiết Du lịch Việt Nam
      </h1>
      
      {/* Khung tìm kiếm */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', width: '90%', maxWidth: '500px' }}>
        <input
          type="text"
          placeholder="Nhập tên (VD: Da Lat, Hue)..."
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          style={{ 
            flex: 1, 
            padding: '12px', 
            borderRadius: '8px', 
            border: '1px solid #ccc',
            fontSize: '16px',
            boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
          }}
        />
        <button 
          onClick={handleSearch} 
          disabled={loading} 
          style={{ 
            padding: '0 20px', 
            backgroundColor: '#007bff', 
            color: 'white', 
            border: 'none', 
            borderRadius: '8px',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
          }}
        >
          {loading ? '🔍...' : 'Tìm kiếm'}
        </button>
      </div>

      {/* Khung hiển thị thời tiết */}
      {weather && (
        <div style={{ 
          display: 'flex', 
          gap: '30px', 
          backgroundColor: 'white', 
          padding: '15px 30px', 
          borderRadius: '12px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          marginBottom: '20px',
          color: '#333'
        }}>
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

      {/* Bản đồ: Chiếm phần lớn màn hình */}
      <div style={{ 
        width: '90%', 
        height: '65vh', // Chiếm 65% chiều cao màn hình
        borderRadius: '15px', 
        overflow: 'hidden', 
        boxShadow: '0 0 20px rgba(0,0,0,0.15)',
        border: '4px solid white'
      }}>
        <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <SetViewOnClick coords={center} />
          
          {/* Vòng lặp này chính là để hiển thị 5 points */}
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

    </div>
  );
}

export default App;