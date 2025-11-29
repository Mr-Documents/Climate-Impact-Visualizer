import { Line } from "react-chartjs-2";

function RainfallChart({ data }) {
  const chartData = {
    labels: data.map((_, i) => `Hour ${i}`),
    datasets: [
      {
        label: "Rainfall (mm)",
        data,
        borderWidth: 2,
        tension: 0.3,
      },
    ],
  };

  return (
    <div className="mt-4">
      <Line data={chartData} />
    </div>
  );
}

export default RainfallChart;
