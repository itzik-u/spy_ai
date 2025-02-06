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
  const [address, setAddress] = useState("");
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [error, setError] = useState(null);

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
          const imageUrl = pickedObject.id.imageUrl;
          if (imageUrl) setSelectedImage(imageUrl);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      cesiumViewer.screenSpaceEventHandler.setInputAction((click) => {
        const cartesian = cesiumViewer.camera.pickEllipsoid(
          click.position,
          cesiumViewer.scene.globe.ellipsoid
        );

        if (cartesian) {
          const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
          const longitude = Cesium.Math.toDegrees(cartographic.longitude);
          const latitude = Cesium.Math.toDegrees(cartographic.latitude);

          setSelectedLocation({ latitude, longitude });

          viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(longitude, latitude),
            billboard: {
              image: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
              width: 32,
              height: 32,
            },
          });
        }
      }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
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
      setLoading(true);
      setError(null);
      const response = await axios.get("http://localhost:5000/images");

      if (!response.data || response.data.length === 0) {
        setImages([]);
        setError("No images found in the database");
        return;
      }

      // Filter out any invalid data
      const validImages = response.data.filter(img =>
        img &&
        img.url &&
        img.location &&
        typeof img.location.latitude === 'number' &&
        typeof img.location.longitude === 'number'
      );

      if (validImages.length === 0) {
        setError("No valid images found with location data");
      }

      setImages(validImages);
      console.log("Fetched images:", validImages);
    } catch (error) {
      console.error("Error fetching images:", error);
      setError("Failed to fetch images from the server");
      setImages([]);
    } finally {
      setLoading(false);
    }
  };

  const clearMarkers = () => {
    if (viewer) {
      viewer.dataSources.removeAll();
      viewer.entities.removeAll();
      setImages([]);
      setSelectedLocation(null);
      setFile(null);
      setSelectedImage(null);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedLocation) {
      alert("Please select a location first");
      return;
    }

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
      await axios.post("http://localhost:5000/upload", {
        url: imageUrl,
        location: selectedLocation
      });

      alert("Image uploaded successfully!");
      setSelectedLocation(null); // Clear the selected location
      clearMarkers(); // Clear temporary markers
      fetchImages();
    } catch (error) {
      console.error("Error uploading image:", error);
      alert("Failed to upload image.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddressSearch = async () => {
    if (!address.trim()) {
      alert("Please enter an address");
      return;
    }

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          address
        )}`
      );
      const data = await response.json();

      if (data && data[0]) {
        const { lat, lon } = data[0];
        setSelectedLocation({
          latitude: parseFloat(lat),
          longitude: parseFloat(lon),
        });

        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            parseFloat(lon),
            parseFloat(lat),
            10000.0
          ),
        });

        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(
            parseFloat(lon),
            parseFloat(lat)
          ),
          billboard: {
            image: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
            width: 32,
            height: 32,
          },
        });
      } else {
        alert("Address not found");
      }
    } catch (error) {
      console.error("Error searching address:", error);
      alert("Error searching address");
    }
  };

  useEffect(() => {
    if (viewer && images && images.length > 0) {
      viewer.dataSources.removeAll();
      viewer.entities.removeAll();

      const dataSource = new Cesium.CustomDataSource('markers');
      viewer.dataSources.add(dataSource);

      // Function to calculate distance between two points
      const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      };

      // Group markers with dynamic clustering
      const clusters = [];
      const clusterDistance = 500; // Distance in km to merge clusters

      images.forEach(image => {
        if (!image || !image.location) return;

        let addedToCluster = false;
        for (let cluster of clusters) {
          const distance = calculateDistance(
            cluster.center.lat,
            cluster.center.lon,
            image.location.latitude,
            image.location.longitude
          );

          if (distance < clusterDistance) {
            // Update cluster center to average position
            const totalImages = cluster.images.length + 1;
            cluster.center.lat = (cluster.center.lat * cluster.images.length + image.location.latitude) / totalImages;
            cluster.center.lon = (cluster.center.lon * cluster.images.length + image.location.longitude) / totalImages;
            cluster.images.push(image);
            addedToCluster = true;
            break;
          }
        }

        if (!addedToCluster) {
          clusters.push({
            center: {
              lat: image.location.latitude,
              lon: image.location.longitude
            },
            images: [image]
          });
        }
      });

      // Create markers for each cluster
      const clusterMarkers = clusters.map(cluster => {
        const clusterEntity = dataSource.entities.add({
          position: Cesium.Cartesian3.fromDegrees(
            cluster.center.lon,
            cluster.center.lat
          ),
          billboard: {
            image: createClusterCanvas(cluster.images.length),
            width: 100,
            height: 100,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            show: true
          }
        });

        const individualMarkers = cluster.images.map(image => {
          return dataSource.entities.add({
            position: Cesium.Cartesian3.fromDegrees(
              image.location.longitude,
              image.location.latitude
            ),
            billboard: {
              image: "https://cdn-icons-png.flaticon.com/512/4503/4503941.png",
              width: 40,
              height: 40,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
              show: false
            },
            imageUrl: image.url
          });
        });

        return { clusterEntity, individualMarkers, count: cluster.images.length };
      });

      const preRenderListener = () => {
        const cameraHeight = viewer.camera.positionCartographic.height;
        const threshold = 7000000;
        const isZoomedOut = cameraHeight > threshold;

        clusterMarkers.forEach(({ clusterEntity, individualMarkers }) => {
          const position = clusterEntity.position.getValue(viewer.clock.currentTime);
          if (!position) return;

          // Check if marker is facing camera
          const cameraPosition = viewer.camera.position;
          const normal = Cesium.Cartesian3.normalize(position, new Cesium.Cartesian3());
          const dotProduct = Cesium.Cartesian3.dot(
            normal,
            Cesium.Cartesian3.normalize(
              Cesium.Cartesian3.subtract(cameraPosition, position, new Cesium.Cartesian3()),
              new Cesium.Cartesian3()
            )
          );

          const isFacingCamera = dotProduct > 0;

          if (isZoomedOut) {
            clusterEntity.billboard.show = isFacingCamera;
            individualMarkers.forEach(marker => {
              marker.billboard.show = false;
            });
          } else {
            clusterEntity.billboard.show = false;
            individualMarkers.forEach(marker => {
              const markerPosition = marker.position.getValue(viewer.clock.currentTime);
              if (markerPosition) {
                const markerNormal = Cesium.Cartesian3.normalize(markerPosition, new Cesium.Cartesian3());
                const markerDotProduct = Cesium.Cartesian3.dot(
                  markerNormal,
                  Cesium.Cartesian3.normalize(
                    Cesium.Cartesian3.subtract(cameraPosition, markerPosition, new Cesium.Cartesian3()),
                    new Cesium.Cartesian3()
                  )
                );
                marker.billboard.show = markerDotProduct > 0;
              }
            });
          }
        });
      };

      viewer.scene.preRender.addEventListener(preRenderListener);

      return () => {
        if (viewer && !viewer.isDestroyed()) {
          viewer.scene.preRender.removeEventListener(preRenderListener);
          viewer.dataSources.remove(dataSource);
        }
      };
    }
  }, [viewer, images]);

  // Add this function to create the cluster marker canvas
  const createClusterCanvas = (count) => {
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 48;
    const context = canvas.getContext('2d');

    // Draw circle
    context.beginPath();
    context.arc(24, 24, 20, 0, 2 * Math.PI);
    context.fillStyle = 'rgba(0, 255, 255, 0.7)';
    context.fill();
    context.strokeStyle = 'white';
    context.lineWidth = 2;
    context.stroke();

    // Draw text
    context.fillStyle = 'white';
    context.font = 'bold 16px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(count.toString(), 24, 24);

    return canvas;
  };

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
      <div
        id="cesiumContainer"
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
        }}
      ></div>

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
              color: "cyan",
              cursor: loading ? "default" : "pointer",
              textAlign: "center",
              borderRadius: "5px",
              textShadow: "0px 0px 5px cyan",
              opacity: loading ? 0.7 : 1,
            }}
            onClick={!loading ? fetchImages : undefined}
          >
            {loading ? "Loading..." : "Show All Markers"}
          </p>
          <div
            style={{
              margin: "10px 0",
              padding: "10px",
              backgroundColor: "rgba(0, 255, 255, 0.1)",
              borderRadius: "5px",
            }}
          >
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter address..."
              style={{
                width: "100%",
                padding: "5px",
                marginBottom: "5px",
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                border: "1px solid cyan",
                color: "white",
                borderRadius: "3px",
              }}
            />
            <button
              onClick={handleAddressSearch}
              style={{
                width: "100%",
                padding: "5px",
                backgroundColor: "rgba(0, 255, 255, 0.2)",
                border: "1px solid cyan",
                color: "cyan",
                cursor: "pointer",
                borderRadius: "3px",
              }}
            >
              Search Address
            </button>
          </div>

          {selectedLocation && (
            <div
              style={{
                margin: "10px 0",
                padding: "10px",
                backgroundColor: "rgba(0, 255, 255, 0.1)",
                color: "cyan",
                borderRadius: "5px",
              }}
            >
              Selected Location:<br />
              Lat: {selectedLocation.latitude.toFixed(6)}<br />
              Lon: {selectedLocation.longitude.toFixed(6)}
            </div>
          )}

          {error && (
            <p
              style={{
                margin: "10px 0",
                padding: "10px",
                backgroundColor: "rgba(255, 0, 0, 0.1)",
                color: "#ff4444",
                textAlign: "center",
                borderRadius: "5px",
                textShadow: "0px 0px 5px red",
              }}
            >
              {error}
            </p>
          )}

          <input
            type="file"
            id="fileInput"
            onChange={(e) => setFile(e.target.files[0])}
            style={{ display: "none" }}
          />
        </div>
      )}

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
