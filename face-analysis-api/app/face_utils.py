# face_utils.py

import cv2
import numpy as np
import requests
from insightface.app import FaceAnalysis
from collections import Counter
from io import BytesIO

# 初始化 InsightFace（只初始化一次）
face_app = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
face_app.prepare(ctx_id=0)

def download_image_from_url(url):
    try:
        resp = requests.get(url, timeout=10)
        img_array = np.asarray(bytearray(resp.content), dtype=np.uint8)
        image = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        return image
    except Exception as e:
        print(f"❌ Error downloading image: {e}")
        return None

def extract_main_face_embedding(image_urls):
    all_faces = []
    face_to_image_map = {}

    for url in image_urls:
        img = download_image_from_url(url)
        if img is None:
            continue

        faces = face_app.get(img)
        for face in faces:
            face_id = tuple(np.round(face.embedding[:5], 2))  # 简化用于聚类
            all_faces.append(face_id)
            face_to_image_map[face_id] = face

    if not all_faces:
        return None

    # 找出出现频率最高的主脸
    main_face_id = Counter(all_faces).most_common(1)[0][0]
    main_face = face_to_image_map[main_face_id]

    return {
        "embedding": main_face.embedding.tolist(),
        "bbox": main_face.bbox.tolist(),
        "gender": main_face.sex,
        "age": int(main_face.age)
    }
