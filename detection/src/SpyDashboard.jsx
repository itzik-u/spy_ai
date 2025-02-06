import React, { useEffect, useState } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import axios from "axios";

export default function SpyDashboard() {
  const [images, setImages] = useState([]);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    let cesiumViewer;

    const initializeCesium = async () => {
      Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN;
      const terrainProvider = await Cesium.createWorldTerrainAsync();

      cesiumViewer = new Cesium.Viewer("cesiumContainer", {
        terrainProvider,
        baseLayerPicker: true,
      });
      setViewer(cesiumViewer);

      cesiumViewer.screenSpaceEventHandler.setInputAction((movement) => {
        const pickedObject = cesiumViewer.scene.pick(movement.position);
        if (Cesium.defined(pickedObject) && pickedObject.id) {
          const imageUrl = pickedObject.id.imageUrl; // Accessing the custom property we will set
          if (imageUrl) setSelectedImage(imageUrl);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    };

    initializeCesium();

    return () => {
      if (cesiumViewer) {
        cesiumViewer.destroy();
      }
    };
  }, []);

  const fetchImages = async () => {
    try {
      const res = await axios.get("http://localhost:5000/images");
      setImages(
        res.data.map((image) => ({
          ...image,
          position: Cesium.Cartesian3.fromDegrees(
            Math.random() * 360 - 180,
            Math.random() * 180 - 90
          ),
        }))
      );
    } catch (error) {
      console.error("Error fetching images:", error);
    }
  };

  const clearMarkers = () => {
    if (viewer) {
      viewer.entities.removeAll();
    }
  };

  const handleUpload = async () => {
    if (!file) {
      alert("Please select a file to upload.");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "Aa123456");

    try {
      const cloudinaryRes = await axios.post(
        "https://api.cloudinary.com/v1_1/dbs8wrvlv/image/upload",
        formData
      );

      const imageUrl = cloudinaryRes.data.secure_url;
      await axios.post("http://localhost:5000/upload", { url: imageUrl });
      alert("Image uploaded successfully!");
      fetchImages();
    } catch (error) {
      console.error("Error uploading image:", error);
      alert("Failed to upload image.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (viewer && images.length) {
      images.forEach((image) => {
        const entity = viewer.entities.add({
          position: image.position,
          billboard: {
            image: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
            width: 32,
            height: 32,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        // Add custom property to the entity for later retrieval
        entity.imageUrl = image.url;
      });
    }
  }, [viewer, images]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        backgroundColor: "black",
        fontFamily: "Arial, sans-serif",
        color: "white",
      }}
    >
      {/* Cesium Globe */}
      <div
        id="cesiumContainer"
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
        }}
      ></div>

      {/* Dashboard */}
      {!selectedImage && (
        <div
          style={{
            position: "absolute",
            top: "10px",
            left: "10px",
            zIndex: 1,
            padding: "10px",
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            borderRadius: "10px",
          }}
        >
          <p
            style={{
              margin: "10px 0",
              padding: "10px",
              backgroundColor: "rgba(0, 255, 255, 0.1)",
              color: "#0ff",
              cursor: "pointer",
              textAlign: "center",
              borderRadius: "5px",
              textShadow: "0px 0px 5px cyan",
            }}
            onClick={() => document.getElementById("fileInput").click()}
          >
            Select Image
          </p>
          <p
            style={{
              margin: "10px 0",
              padding: "10px",
              backgroundColor: "rgba(0, 255, 255, 0.1)",
              color: "#0ff",
              cursor: "pointer",
              textAlign: "center",
              borderRadius: "5px",
              textShadow: "0px 0px 5px cyan",
            }}
            onClick={handleUpload}
          >
            {loading ? "Uploading..." : "Upload Image"}
          </p>
          <p
            style={{
              margin: "10px 0",
              padding: "10px",
              backgroundColor: "rgba(0, 255, 255, 0.1)",
              color: "#0ff",
              cursor: "pointer",
              textAlign: "center",
              borderRadius: "5px",
              textShadow: "0px 0px 5px cyan",
            }}
            onClick={clearMarkers}
          >
            Clear Markers
          </p>
          <p
            style={{
              margin: "10px 0",
              padding: "10px",
              backgroundColor: "rgba(0, 255, 255, 0.1)",
              color: "#0ff",
              cursor: "pointer",
              textAlign: "center",
              borderRadius: "5px",
              textShadow: "0px 0px 5px cyan",
            }}
            onClick={fetchImages}
          >
            Show All Markers
          </p>
          <input
            type="file"
            id="fileInput"
            onChange={(e) => setFile(e.target.files[0])}
            style={{ display: "none" }}
          />
        </div>
      )}

      {/* Full-Screen Futuristic Image Display */}
      {selectedImage && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0, 0, 0, 0.9)",
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            textAlign: "center",
          }}
        >
          <img
            src={selectedImage}
            alt="Selected"
            style={{
              maxWidth: "80%",
              maxHeight: "80%",
              border: "5px solid cyan",
              borderRadius: "10px",
              boxShadow: "0 0 20px cyan",
            }}
          />
          <button
            style={{
              marginTop: "20px",
              padding: "10px 20px",
              backgroundColor: "cyan",
              border: "none",
              borderRadius: "5px",
              color: "black",
              cursor: "pointer",
              textShadow: "none",
            }}
            onClick={() => setSelectedImage(null)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
