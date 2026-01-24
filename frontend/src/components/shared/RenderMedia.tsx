export const RenderMedia = (mediaUrl: string) => {
    const url = mediaUrl.toLowerCase();
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/.test(url);
    const isVideo = /\.(mp4|webm|ogg)$/.test(url);

    const mediaClass = "object-contain w-full h-full";
    const mediaContainerClass = "py-4 flex justify-center pb-1 ";

    if (isImage) {
        return (
            <div className={mediaContainerClass}>
                <img src={mediaUrl} alt="Hình ảnh" className={mediaClass} />
            </div>
        );
    }

    if (isVideo) {
        return (
            <div className={mediaContainerClass}>
                <video controls src={mediaUrl} className={mediaClass}>
                    Trình duyệt của bạn không hỗ trợ video.
                </video>
            </div>
        );
    }

    return null;
};