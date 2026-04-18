import { api } from './client';
import toast from 'react-hot-toast';

/** Open browser-print HTML in a new window (authenticated via axios, then blob URL). */
export async function openHtmlPrint(id: string) {
  try {
    const res = await api.get(`/print/receipt/${id}/html`, { responseType: 'text' });
    const blob = new Blob([res.data], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      toast.error('Popup blocked — browser mein popup allow karein');
      URL.revokeObjectURL(url);
      return;
    }
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Print load failed');
  }
}

/** Download a nicely formatted PDF receipt. Format: 'a4' (default) or 'thermal' (58mm). */
export async function downloadPdf(
  id: string,
  receiptNo: string,
  format: 'a4' | 'thermal' = 'a4'
) {
  try {
    const res = await api.get(`/print/receipt/${id}/pdf`, {
      params: { format },
      responseType: 'blob',
    });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-${receiptNo}${format === 'thermal' ? '-58mm' : ''}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2_000);
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'PDF download failed');
  }
}

/** Send thermal print to backend-connected printer. */
export async function printThermal(id: string) {
  try {
    await api.post(`/print/receipt/${id}`);
    toast.success('Print bheja');
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Printer error');
  }
}

/** Download Excel from a given export path. */
export async function downloadExcel(path: string, filename: string) {
  try {
    const res = await api.get(path, { responseType: 'blob' });
    const blob = new Blob([res.data]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2_000);
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Download failed');
  }
}
