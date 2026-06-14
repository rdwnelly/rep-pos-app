import { sequelize } from './db';
import { Op } from 'sequelize';

export const generateInvoiceNumber = async (model: any, type: string) => {
    const prefix = type === 'SALE' ? 'INV' : 'PO';
    const year = new Date().getFullYear().toString().slice(-2); // e.g. '25'
    const prefixYear = `${prefix}${year}-`;

    try {
        const lastRecord = await model.findOne({
            where: {
                invoiceNumber: {
                    [Op.like]: `${prefixYear}%`
                }
            },
            order: [
                [sequelize.fn('LENGTH', sequelize.col('invoiceNumber')), 'DESC'],
                ['invoiceNumber', 'DESC']
            ]
        });

        let newSeq = 1;
        if (lastRecord && lastRecord.invoiceNumber) {
            const parts = lastRecord.invoiceNumber.split('-');
            // parts[0] is INV25, parts[1] is the sequence
            if (parts[1]) {
                const lastSeq = parseInt(parts[1], 10);
                if (!isNaN(lastSeq)) {
                    newSeq = lastSeq + 1;
                }
            }
        }

        return `${prefixYear}${newSeq.toString().padStart(10, '0')}`;
    } catch (error) {
        console.error("Error generating invoice number:", error);
        // Fallback
        return `${prefixYear}${Date.now().toString().slice(-10)}`;
    }
};
