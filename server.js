const express  = require('express');
const fetch    = require('node-fetch');
const FormData = require('form-data');
const cors     = require('cors');
const Jimp     = require('jimp');

const app  = express();
const jobs = {};

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── IMG2IMG SUAVE ─────────────────────────────────────────────
app.post('/img2img', async (req, res) => {
  const { imageUrl, prompt, negativePrompt, stabilityKey, strength, variacion } = req.body;

  if (!imageUrl || !prompt || !stabilityKey) {
    return res.status(400).json({ ok: false, error: 'Faltan parámetros img2img' });
  }

  const jobId = 'job_img2img_' + Date.now() + '_' + (variacion || '0');
  jobs[jobId] = { status: 'processing' };
  res.json({ ok: true, jobId });

  (async () => {
    try {
      console.log('=== IMG2IMG SUAVE ===', jobId);
      console.log('strength:', strength || 0.16);
      console.log(prompt);

      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) {
        jobs[jobId] = { status: 'error', error: 'No se pudo descargar la imagen de referencia' };
        return;
      }

      const imgBuffer = await imgRes.buffer();
      const image = await Jimp.read(imgBuffer);
      image.cover(1024, 1024);
      const resizedBuffer = await image.getBufferAsync(Jimp.MIME_PNG);

      const promptFinal = prompt;

      const negativeFinal =
        negativePrompt ||
        "blurry, low quality, distorted, deformed, ugly, watermark, logo, person, hand, finger, body part, face, skin, cropped jewelry, partial view, duplicate jewelry, broken chain, melted metal, warped geometry, impossible structure, incoherent attachments, random letters, misspelled name, unreadable nameplate, malformed butterfly, bad butterfly shape, messy charms, stones, gemstones, diamonds, cheap plastic, toy jewelry, cartoon, illustration, fantasy";

      const form = new FormData();
      form.append('init_image', resizedBuffer, {
        filename: 'reference.png',
        contentType: 'image/png'
      });

      form.append('init_image_mode', 'IMAGE_STRENGTH');
      form.append('image_strength', String(strength || 0.16));
      form.append('text_prompts[0][text]', promptFinal);
      form.append('text_prompts[0][weight]', '1.25');
      form.append('text_prompts[1][text]', negativeFinal);
      form.append('text_prompts[1][weight]', '-1');
      form.append('cfg_scale', '12');
      form.append('steps', '45');
      form.append('samples', '1');

      const stabRes = await fetch(
        'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image',
        {
          method: 'POST',
          headers: {
            ...form.getHeaders(),
            Authorization: 'Bearer ' + stabilityKey,
            Accept: 'application/json'
          },
          body: form
        }
      );

      if (!stabRes.ok) {
        const errText = await stabRes.text();
        console.error('Stability img2img error:', errText);
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
      console.error('img2img error:', e.message);
      jobs[jobId] = { status: 'error', error: e.message };
    }
  })();
});

// ── TXT2IMG ───────────────────────────────────────────────────
app.post('/txt2img', async (req, res) => {
  const { prompt, ambienteSuffix, negativePrompt, stabilityKey, variacion } = req.body;

  if (!prompt || !stabilityKey) {
    return res.status(400).json({ ok: false, error: 'Faltan parámetros txt2img' });
  }

  const jobId = 'job_txt2img_' + Date.now() + '_' + (variacion || '0');
  jobs[jobId] = { status: 'processing' };
  res.json({ ok: true, jobId });

  (async () => {
    try {
      const promptFinal = prompt + (ambienteSuffix || '');

      console.log('=== TXT2IMG ===', jobId);
      console.log(promptFinal);

      const negativeFinal =
        negativePrompt ||
        "blurry, low quality, distorted, deformed, ugly, watermark, logo, person, hand, finger, body part, face, skin, cropped jewelry, partial view, duplicate jewelry, broken chain, melted metal, warped geometry, impossible structure, incoherent attachments, random letters, misspelled name, unreadable nameplate, malformed butterfly, bad butterfly shape, messy charms, stones, gemstones, diamonds, cheap plastic, toy jewelry, cartoon, illustration, fantasy";

      const body = JSON.stringify({
        text_prompts: [
          { text: promptFinal, weight: 1.25 },
          { text: negativeFinal, weight: -1 }
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

// ── CONSULTAR RESULTADO ───────────────────────────────────────
app.get('/img2img-result/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];

  if (!job) {
    return res.json({ status: 'not_found' });
  }

  res.json(job);
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor en puerto', PORT));
