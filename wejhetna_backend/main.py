from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Wejhetna Backend",
    version="0.1.0"
)

# CORS - כדי שהאפליקציית React Native תוכל לדבר עם השרת
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # בפיתוח מותר הכל. אחר-כך נצמצם.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#try push 1 alaa
@app.get("/")
def read_root():
    return {"message": "Wejhetna backend is alive 🚀"}


@app.get("/health")
def health_check():
    return {"status": "ok"}
