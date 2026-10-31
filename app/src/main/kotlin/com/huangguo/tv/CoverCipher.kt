package com.huangguo.tv

import android.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * 黄果封面图是 AES-CBC 加密后的 base64 文本，密钥/IV 与站点前端一致。
 * 解密后按 PKCS 风格重复字节去填充，再裁剪到图片结束标记。
 */
object CoverCipher {
    private const val KEY = "f5d965df75336270"
    private const val IV = "97b60394abc2fbe1"

    fun decryptToBytes(content: ByteArray): ByteArray? {
        if (isRawImage(content)) return content
        val b64 = String(content, Charsets.UTF_8).trim()
        if (b64.isEmpty()) return null
        val cipherBytes = try { Base64.decode(b64, Base64.DEFAULT) } catch (e: Exception) { return null }
        if (cipherBytes.isEmpty() || cipherBytes.size % 16 != 0) return null
        val plain = try {
            val c = Cipher.getInstance("AES/CBC/NoPadding")
            c.init(
                Cipher.DECRYPT_MODE,
                SecretKeySpec(KEY.toByteArray(Charsets.UTF_8), "AES"),
                IvParameterSpec(IV.toByteArray(Charsets.UTF_8))
            )
            c.doFinal(cipherBytes)
        } catch (e: Exception) {
            return null
        }
        return trimToImageEnd(stripPad(plain))
    }

    private fun isRawImage(b: ByteArray): Boolean {
        if (b.size < 4) return false
        val h = b[0].toInt() and 0xFF
        val h2 = b[1].toInt() and 0xFF
        if (h == 0xFF && h2 == 0xD8) return true
        if (h == 0x89 && h2 == 0x50) return true
        if (h == 0x52 && h2 == 0x49) return true // RIFF/webp
        if (h == 0x47 && h2 == 0x49) return true // GIF
        return false
    }

    private fun stripPad(b: ByteArray): ByteArray {
        if (b.isEmpty()) return b
        val pad = b[b.size - 1].toInt() and 0xFF
        if (pad in 1..16 && b.size >= pad) {
            var ok = true
            for (i in 1..pad) {
                if ((b[b.size - i].toInt() and 0xFF) != pad) { ok = false; break }
            }
            if (ok) return b.copyOf(b.size - pad)
        }
        return b
    }

    private fun trimToImageEnd(b: ByteArray): ByteArray {
        if (b.size >= 2 && (b[0].toInt() and 0xFF) == 0xFF && (b[1].toInt() and 0xFF) == 0xD8) {
            for (i in b.size - 2 downTo 0) {
                if ((b[i].toInt() and 0xFF) == 0xFF && (b[i + 1].toInt() and 0xFF) == 0xD9) {
                    return b.copyOf(i + 2)
                }
            }
        }
        if (b.size >= 8 && (b[0].toInt() and 0xFF) == 0x89) {
            val iend = byteArrayOf(0x49, 0x45, 0x4E, 0x44, 0xAE.toByte(), 0x42, 0x60, 0x82.toByte())
            outer@ for (i in 0..b.size - 8) {
                for (j in 0..7) {
                    if (b[i + j] != iend[j]) continue@outer
                }
                return b.copyOf(i + 8)
            }
        }
        return b
    }
}
