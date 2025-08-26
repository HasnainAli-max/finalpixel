// pages/profile.js
"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/router";
import { auth, db } from "@/lib/firebase/config";
import { onAuthStateChanged, updateProfile, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { Toaster, toast } from "sonner";
import Navbar from "@/components/Navbar";
import ChangePassword from "@/components/ChangePassword";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_MB = 10;

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  // display-only
  const [email, setEmail] = useState("");
  const [photoURL, setPhotoURL] = useState("");

  // editable fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [saving, setSaving]       = useState(false);
  const [loading, setLoading]     = useState(true);

  // avatar upload state
  const [file, setFile]           = useState(null);
  const [preview, setPreview]     = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging]   = useState(false);

  // derived
  const displayName = useMemo(() => {
    const name = `${firstName || ""} ${lastName || ""}`.trim();
    return name || "No name set";
  }, [firstName, lastName]);

  const initials = useMemo(() => {
    const a = (firstName || "").trim();
    const b = (lastName || "").trim();
    if (a || b) return `${a?.[0] || ""}${b?.[0] || ""}`.toUpperCase() || "U";
    const fromEmail = (email || "").trim().charAt(0);
    return (fromEmail || "U").toUpperCase();
  }, [firstName, lastName, email]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      setUser(u);
      setEmail(u.email || "");
      setPhotoURL(u.photoURL || "");

      try {
        const ref = doc(db, "users", u.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d = snap.data();
          setFirstName(d.firstName || (u.displayName?.split(" ")?.[0] ?? ""));
          setLastName(d.lastName || (u.displayName?.split(" ")?.slice(1).join(" ") ?? ""));
        } else {
          const parts = (u.displayName || "").trim().split(" ").filter(Boolean);
          setFirstName(parts[0] || "");
          setLastName(parts.slice(1).join(" ") || "");
        }
      } catch {
        const parts = (u.displayName || "").trim().split(" ").filter(Boolean);
        setFirstName(parts[0] || "");
        setLastName(parts.slice(1).join(" ") || "");
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const handleSave = async () => {
    const current = auth.currentUser;
    if (!current) return toast.error("Not signed in.");

    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn) return toast.error("First name is required.");

    try {
      setSaving(true);
      const newDisplayName = `${fn} ${ln}`.trim();

      await updateProfile(current, { displayName: newDisplayName });
      await current.reload();
      setUser(auth.currentUser);

      await setDoc(
        doc(db, "users", current.uid),
        {
          firstName: fn,
          lastName: ln,
          displayName: newDisplayName,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      toast.success("Name updated!");
    } catch (e) {
      console.error(e);
      toast.error("Failed to update name.");
    } finally {
      setSaving(false);
    }
  };

  const validateIncomingFile = (f) => {
    if (!f) return "No file selected.";
    if (!ACCEPTED.includes(f.type)) return "Use JPG, PNG, or WEBP.";
    if (f.size > MAX_MB * 1024 * 1024) return `Max file size is ${MAX_MB} MB.`;
    return null;
  };

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) {
      setFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      return;
    }
    const err = validateIncomingFile(f);
    if (err) return toast.error(err);

    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    const err = validateIncomingFile(f);
    if (err) return toast.error(err);

    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const cancelPreview = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFile(null);
  };

  const handleUploadPhoto = async () => {
    const current = auth.currentUser;
    if (!current) return toast.error("Not signed in.");
    if (!file)  return toast.error("Please choose an image.");

    try {
      setUploading(true);
      const idToken = await current.getIdToken(true);

      const form = new FormData();
      form.append("file", file, file.name);

      const res = await fetch("/api/upload-avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        body: form,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed.");

      const newURL = data?.photoURL;
      if (!newURL) {
        toast.error("Upload succeeded but URL missing.");
        return;
      }

      await updateProfile(current, { photoURL: newURL });
      await current.reload();
      setUser(auth.currentUser);
      setPhotoURL(newURL);

      await setDoc(
        doc(db, "users", current.uid),
        { photoURL: newURL, avatarPath: data?.avatarPath || null, updatedAt: serverTimestamp() },
        { merge: true }
      );

      toast.success("Profile photo updated!");
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      setFile(null);
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Failed to upload image.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Navbar user={user} onSignOut={() => signOut(auth)} />
      <Toaster richColors position="top-right" closeButton />

      <main className="max-w-3xl mx-auto px-4 py-6">
        <section className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-5">
          {/* Compact header row */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Smaller avatar + camera trigger */}
              <div className="relative w-16 h-16 md:w-20 md:h-20 shrink-0">
                {photoURL ? (
                  <img
                    src={photoURL}
                    alt="Profile avatar"
                    className="w-16 h-16 md:w-20 md:h-20 rounded-full object-cover border border-gray-200 bg-gray-100 dark:bg-gray-800"
                    referrerPolicy="no-referrer"
                    onError={() => setPhotoURL("")}
                  />
                ) : (
                  <div
                    className="w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center
                               bg-gradient-to-br from-purple-500 to-indigo-600
                               text-white border border-gray-200 shadow-sm select-none"
                    aria-label="Default avatar"
                    title="Default avatar"
                  >
                    <span className="text-lg md:text-xl font-semibold tracking-wide">
                      {initials}
                    </span>
                  </div>
                )}

                {/* Floating camera button (only browse trigger) */}
                <label
                  htmlFor="avatar-file"
                  className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow grid place-items-center cursor-pointer hover:scale-105 transition"
                  title="Change photo"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-700 dark:text-gray-200" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 2a1 1 0 00-.894.553L7.382 4H5a3 3 0 00-3 3v9a3 3 0 003 3h14a3 3 0 003-3V7a3 3 0 00-3-3h-2.382l-.724-1.447A1 1 0 0014 2H9zm3 5a5 5 0 110 10 5 5 0 010-10z" />
                  </svg>
                </label>
                <input id="avatar-file" type="file" accept={ACCEPTED.join(",")} onChange={onFileChange} className="hidden" />
              </div>

              <div className="min-w-0">
                <h1 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {loading ? "Loading..." : displayName}
                </h1>
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 truncate">{email}</p>
              </div>
            </div>

            {/* Compact name save button */}
            <button
              onClick={handleSave}
              disabled={loading || saving}
              className={`px-3 py-2 rounded-md text-white text-sm font-medium
                ${saving ? "bg-purple-400 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700"}`}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>

          {/* Ultra-compact uploader strip */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
            onDrop={onDrop}
            className={`mt-4 rounded-lg border border-dashed px-3 py-2 text-sm flex items-center gap-3
              ${dragging ? "border-purple-500 bg-purple-50/70 dark:bg-purple-900/20" : "border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"}`}
          >
            {!preview ? (
              <div className="flex items-center justify-between w-full">
                <span className="text-gray-700 dark:text-gray-300 truncate">
                  Drag & drop an image here. To browse, click the camera icon.
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                  JPG/PNG/WEBP · ≤ {MAX_MB}MB
                </span>
              </div>
            ) : (
              <>
                <img
                  src={preview}
                  alt="Preview"
                  className="h-10 w-10 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-gray-800 dark:text-gray-200 truncate">{file?.name}</p>
                </div>
                <button
                  onClick={cancelPreview}
                  disabled={uploading}
                  className="px-3 py-1.5 rounded-md border text-sm border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUploadPhoto}
                  disabled={uploading}
                  className={`px-3 py-1.5 rounded-md text-white text-sm
                    ${uploading ? "bg-purple-400 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700"}`}
                >
                  {uploading ? "Uploading…" : "Use photo"}
                </button>
              </>
            )}
          </div>

          {/* Compact name fields */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                First name
              </label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={loading || saving}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Last name
              </label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={loading || saving}
              />
            </div>
          </div>

          <div className="mt-3">
            <button
              onClick={() => {
                const current = auth.currentUser;
                const parts = (current?.displayName || "").trim().split(" ").filter(Boolean);
                setFirstName(parts[0] || "");
                setLastName(parts.slice(1).join(" ") || "");
                toast.message("Reverted to current name.");
              }}
              disabled={loading || saving}
              className="inline-flex items-center justify-center px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Reset
            </button>
          </div>

          {/* Password card */}
          <div className="mt-6">
            <ChangePassword />
          </div>
        </section>
      </main>
    </>
  );
}
