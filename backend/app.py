from fastapi import FastAPI

app = FastAPI(title="AI Career Coach")


@app.get("/api/health")
def health():
    return {"status": "ok"}