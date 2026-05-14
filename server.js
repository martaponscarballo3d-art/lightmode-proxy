const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const jobs = {};

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.post('/txt2img', async (req, res) => {
  const { prompt, ambienteSuffix, negativePrompt, stabilityKey, variacion } = req.body;

  if (!prompt || !stabilityKey) {
    return res.status(400).json({ ok: false, error: 'Faltan parámetros' });
  }

  const jobId = 'job_' + Date.now() + '_' + (variacion || '0');
  jobs[jobId] = { status: 'processing' };
  res.json({ ok: true, jobId });

  (async () => {
    try {
      const promptFinal = `${prompt}\n${ambienteSuffix || ''}`;

      console.log('=== TXT2IMG JOB ===', jobId);
      console.log(promptFinal);

      const negative =
        negativePrompt ||
        "blurry, low quality, distorted, deformed, ugly, text, watermark, logo, person, hand, finger, body part, face, skin, cropped jewelry, partial view, cut off, duplicate, broken metal, melted metal, warped geometry, impossible jewelry structure, unreadable design, malformed charms, random letters, wrong lettering, messy chain, cheap plastic toy jewelry, cartoon, illustration, painting, fantasy";

      const body = JSON.stringify({
        text_prompts: [
          { text: promptFinal, weight: 1.25 },
          { text: negative, weight: -1 }
        ],
        cfg_scale: 12,
        height: 1024,
        width: 1024,
        steps: 45,
        samples: 1
      });

      const stabRes = await fetch(
        'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + stabilityKey,
            Accept: 'application/json'
          },
          body
        }
      );

      if (!stabRes.ok) {
        const errText = await stabRes.text();
        console.error('Stability txt2img error:', errText);
        jobs[jobId] = { status: 'error', error: errText };
        return;
      }

      const data = await stabRes.json();

      if (!data.artifacts || !data.artifacts.length) {
        jobs[jobId] = { status: 'error', error: 'Sin imagen de Stability' };
        return;
      }

      jobs[jobId] = {
        status: 'done',
        base64: data.artifacts[0].base64
      };

      setTimeout(() => {
        delete jobs[jobId];
      }, 10 * 60 * 1000);

    } catch (e) {
      console.error('txt2img error:', e.message);
      jobs[jobId] = { status: 'error', error: e.message };
    }
  })();
});

// Desactivado a propósito.
// Para este proyecto NO usamos img2img porque copia demasiado la referencia.
app.post('/img2img', async (req, res) => {
  return res.status(400).json({
    ok: false,
    error: 'img2img desactivado. Este flujo usa solo txt2img para respetar los cambios del cliente.'
  });
});

app.get('/img2img-result/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.json({ status: 'not_found' });
  res.json(job);
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor en puerto', PORT));
