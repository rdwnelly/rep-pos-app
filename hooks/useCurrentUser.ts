import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';

export type PenggunaAktif = {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  image: string;
};

const TAMU: PenggunaAktif = {
  id: '',
  name: '',
  username: '',
  role: UserRole.CASHIER,
  image: '',
};

/**
 * Pengguna yang sedang login, dibaca dari AuthContext.
 *
 * Sebelumnya layar-layar membacanya dari localStorage `pos_current_user`
 * — salinan yang ditulis AuthContext setelah login. Ada dua masalah
 * dengan salinan itu:
 *
 *   1. Siapa pun bisa mengubahnya lewat DevTools dan memunculkan tombol
 *      yang semestinya tersembunyi. Benteng sebenarnya tetap
 *      firestore.rules, yang membaca peran dari custom claim pada ID
 *      token dan tidak bisa dipalsukan dari browser — jadi ini bukan
 *      lubang fatal. Tapi antarmuka yang menampilkan tombol lalu
 *      menolaknya di server adalah cara buruk memberi tahu batasan.
 *
 *   2. Lebih mengganggu sehari-hari: salinannya ditulis pada
 *      onAuthStateChanged, sementara layar sudah mulai merender pada
 *      event yang sama. Urutannya tidak dijamin, jadi pembacaan
 *      pertama bisa mendapat objek kosong — dan tombolnya berkedip,
 *      atau cashierId sempat kosong.
 *
 * AuthContext memakai custom claim lebih dulu (lihat resolveRole), jadi
 * peran di sini sama persis dengan yang dipakai firestore.rules.
 *
 * `id` sengaja dipetakan dari `uid`: tipe User di aplikasi ini memakai
 * `id`, sedangkan Firebase memakai `uid`.
 */
export const useCurrentUser = (): PenggunaAktif => {
  const { user } = useAuth();

  return useMemo(() => {
    if (!user) return TAMU;
    return {
      id: user.uid,
      name: user.name || user.email || '',
      username: user.username || user.email || '',
      role: (user.role as UserRole) || UserRole.CASHIER,
      image: user.image || '',
    };
  }, [user]);
};
