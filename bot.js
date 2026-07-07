import { Client, GatewayIntentBits, Events, EmbedBuilder } from 'discord.js';
import fetch from 'node-fetch';
import fs from 'fs/promises';


let settings;
try {
  const settingsData = await fs.readFile('settings.json', 'utf8');
  settings = JSON.parse(settingsData);
} catch (error) {
  console.error('Ayarlar dosyası (settings.json) okunamadı:', error);
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const PREFIX = '!';

async function logKomut(mesaj, komut, prompt) {
  const tarih = new Date();
  const logBilgisi = `[${tarih.toLocaleString('tr-TR')}] Kullanıcı: ${mesaj.author.tag} (${mesaj.author.id}) | ID: ${mesaj.guild?.id || 'DM'} | Komut: ${komut}\n`;

  try {
    await fs.appendFile('log.txt', logBilgisi);
  } catch (hata) {
    console.error('Log yazma hatası:', hata);
  }
}

client.on(Events.MessageCreate, async (mesaj) => {
  if (mesaj.author.bot) return;
  if (!mesaj.content.startsWith(PREFIX)) return;

  const komut = mesaj.content.slice(PREFIX.length).trim();
  await logKomut(mesaj, komut);

  if (komut === 'yardım') {
    const yardimEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🤖 Yapay Zeka Resim Oluşturucu')
      .setDescription('Yapay zekanın gücüyle hayal ettiğiniz görselleri saniyeler içinde oluşturun!')
      .addFields(
        {
          name: '🎨 Resim Oluşturma',
          value: '`!resimyap <açıklama>`\n*Örnek: `!resimyap mavi gökyüzünde uçan kuşlar`*',
          inline: false
        },
        {
          name: '❓ Yardım',
          value: '`!yardım`\n*Bu yardım menüsünü görüntüler.*',
          inline: false
        },
        {
          name: '📝 Önemli İpuçları',
          value: '• İngilizce açıklamalar (prompt) daha kaliteli sonuçlar üretir.\n• Resim oluşturma işlemi yoğunluğa göre 1-2 dakika sürebilir.\n• Uygunsuz (NSFW) veya zararlı içerik talepleri otomatik olarak engellenir.',
          inline: false
        }
      )
      .setFooter({ text: 'Stable Horde API • Geliştirilmiş Modern Arayüz' })
      .setTimestamp();

    await mesaj.reply({ embeds: [yardimEmbed] });
    return;
  }

  if (komut.startsWith('resimyap')) {
    const aciklama = komut.slice('resimyap'.length).trim();

    if (!aciklama) {
      const uyariEmbed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle('⚠️ Eksik Açıklama')
        .setDescription('Lütfen oluşturmak istediğiniz resim için bir açıklama girin!\n*Örnek: `!resimyap mavi gökyüzünde uçan kuşlar`*');

      await mesaj.reply({ embeds: [uyariEmbed] });
      return;
    }

    const beklemeEmbed = new EmbedBuilder()
      .setColor('#FEE75C')
      .setTitle('🎨 Resim Çiziliyor...')
      .setDescription('Talebiniz yapay zekaya iletildi, görseliniz hazırlanıyor.')
      .addFields(
        { name: '📝 Girilen Açıklama', value: `\`\`\`\n${aciklama}\n\`\`\``, inline: false },
        { name: '⏳ Durum', value: 'Sıraya alındı, işlem bekleniyor...', inline: true }
      )
      .setFooter({ text: 'İşlem tamamlanana kadar lütfen bekleyin...' })
      .setTimestamp();

    const beklemeMesaji = await mesaj.reply({ embeds: [beklemeEmbed] });

    try {
      const olusturmaYaniti = await fetch('https://stablehorde.net/api/v2/generate/async', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': settings.STABLE_HORDE_API_KEY
        },
        body: JSON.stringify({
          prompt: aciklama,
          params: {
            steps: 30,
            width: 512,
            height: 512,
          },
          nsfw: false,
          censor_nsfw: true,
          trusted_workers: true,
          models: ["stable_diffusion"]
        })
      });

      if (!olusturmaYaniti.ok) {
        throw new Error('Resim oluşturma isteği başarısız oldu');
      }

      const { id } = await olusturmaYaniti.json();

      let resimUrl = null;
      for (let i = 0; i < 60; i++) {
        const durumKontrolu = await fetch(`https://stablehorde.net/api/v2/generate/check/${id}`);
        const durum = await durumKontrolu.json();

        if (durum.done) {
          const sonucYaniti = await fetch(`https://stablehorde.net/api/v2/generate/status/${id}`);
          const sonuc = await sonucYaniti.json();

          if (sonuc.generations && sonuc.generations.length > 0) {
            resimUrl = sonuc.generations[0].img;
            break;
          }
        }

        await new Promise(resolve => setTimeout(resolve, 5000));

        if (i % 2 === 0) {
          const guncelBeklemeEmbed = new EmbedBuilder()
            .setColor('#FEE75C')
            .setTitle('🎨 Resim Çiziliyor...')
            .setDescription('Talebiniz yapay zekaya iletildi, görseliniz hazırlanıyor.')
            .addFields(
              { name: '📝 Girilen Açıklama', value: `\`\`\`\n${aciklama}\n\`\`\``, inline: false },
              { name: '⏳ Durum', value: `Resim oluşturuluyor... (${(i + 1) * 5} saniye geçti)`, inline: true }
            )
            .setFooter({ text: 'İşlem tamamlanana kadar lütfen bekleyin...' })
            .setTimestamp();

          await beklemeMesaji.edit({ embeds: [guncelBeklemeEmbed] });
        }
      }

      if (!resimUrl) {
        throw new Error('Resim oluşturma zaman aşımına uğradı');
      }

      const basariliEmbed = new EmbedBuilder()
        .setColor('#57F287')
        .setTitle('✅ Görsel Başarıyla Oluşturuldu!')
        .setDescription(`**"${aciklama}"** açıklaması için üretilen görsel aşağıdadır.`)
        .setImage(resimUrl)
        .setFooter({ text: `Talep eden: ${mesaj.author.tag}`, iconURL: mesaj.author.displayAvatarURL({ dynamic: true }) })
        .setTimestamp();

      await beklemeMesaji.edit({
        content: null,
        embeds: [basariliEmbed]
      });
    } catch (hata) {
      console.error('Hata:', hata);

      const hataEmbed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle('❌ Bir Hata Oluştu')
        .setDescription('Üzgünüm, resim oluşturulurken beklenmedik bir hata oluştu veya işlem zaman aşımına uğradı.')
        .addFields({ name: 'Olası Nedenler', value: '• Stable Horde sunucularında yoğunluk veya kesinti olabilir.\n• API anahtarınız geçersiz olabilir.\n• Girilen açıklama uygunsuz içerik filtresine takılmış olabilir.' })
        .setTimestamp();

      await beklemeMesaji.edit({
        content: null,
        embeds: [hataEmbed]
      });
    }
  }
});

client.login(settings.DISCORD_TOKEN);