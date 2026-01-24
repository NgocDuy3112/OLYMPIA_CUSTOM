import React from "react";
import type { Question } from "@/types/question";


interface AQuestionBoardProps {
    question: Question;
    timerDuration: number;
}



const renderMedia = (mediaUrl: string) => {
    const url = mediaUrl.toLowerCase();
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/.test(url);
    const isVideo = /\.(mp4|webm|ogg)$/.test(url);

    const mediaClass = "object-contain w-full h-full";
    const mediaContainerClass = "py-4 flex justify-center pb-1 ";

    if (isImage) {
        return (
            <div className={mediaContainerClass}>
                <img
                    src={mediaUrl}
                    alt="Hình ảnh câu hỏi"
                    className={mediaClass}
                />
            </div>
        );
    }

    if (isVideo) {
        return (
            <div className={mediaContainerClass}>
                <video
                    controls
                    src={mediaUrl}
                    className={mediaClass}
                >
                    Trình duyệt của bạn không hỗ trợ video.
                </video>
            </div>
        );
    }

    return null;
}



const AQuestionBoard: React.FC<AQuestionBoardProps> = ({ question, timerDuration }) => {
    return (
        <div className="p-5 rounded-xl max-h-112.5 flex flex-col bg-red-900 ring-4 ring-red-600 shadow-xl">
            <div className="flex justify-between items-center pb-1">
                <p className="text-4xl font-[SVN-Gratelos_Display] font-extrabold text-red-300 uppercase">
                    {question.questionText}
                </p>
                <div className="text-5xl font-[SVN-Gratelos_Display] font-extrabold px-3 py-1 transition-colors duration-500 text-white" >
                    {timerDuration}
                </div>
            </div>
            <div className="flex flex-row">
                {question.questionMediaURL ? (
                    <>
                        <p className="flex flex-2 text-lg sm:text-[20px] font-bold text-white leading-relaxed text-left pt-5">
                            {question.questionText}
                        </p>
                        <div className="flex flex-1">
                            {renderMedia(question.questionMediaURL)}
                        </div>
                    </>
                ) : (
                    <p className="flex text-lg sm:text-[20px] font-bold text-white leading-relaxed text-left pt-5">
                        {question.questionText}
                    </p>
                )
            }
            </div>
                <div className={`flex flex-col bg-red-900 ring-red-600 ring-4 ${question.questionExplanation ? "min-h-20": "min-h-40" } rounded-xl text-white font-extrabold items-center p-5`}>
                <div className="text-2xl justify-center">
                    {question.questionAnswer}
                </div>
                <div className="text-sm">
                    {question.questionExplanation}
                </div>
            </div>

        </div>
    )
}


export default AQuestionBoard;