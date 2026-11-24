FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd -m -u 10001 cad && mkdir /data && chown cad:cad /data
COPY server.py convert.py ./
USER cad
ENV CAD_DATA_DIR=/data OPENBLAS_NUM_THREADS=1
EXPOSE 8000
CMD ["uvicorn","server:app","--host","0.0.0.0","--port","8000","--workers","1"]
